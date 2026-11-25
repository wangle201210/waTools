package be

import (
	"context"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/alicebob/miniredis/v2/server"
)

func TestTokenQueryMixedResultsAndReadOnly(t *testing.T) {
	server := miniredis.RunT(t)
	const payload = `{"token":"json-token +/==","mch_id":7}`
	server.Set("l:usr:token:101", payload)
	server.SetTTL("l:usr:token:101", time.Hour)
	server.Set("l:usr:token:102", "raw-token")
	server.Set("l:usr:token:104", `{"token":""}`)
	server.Set("l:usr:token:105", `{"token":123}`)
	server.Set("l:usr:token:106", `{"other":"not-a-token"}`)
	server.Lpush("l:usr:token:107", "wrong-type")

	results, err := new(TokenService).Query(t.Context(), TokenQueryRequest{
		Host: server.Addr(), UserIDs: []string{"101", "102", "103", "104", "105", "106", "107", "000101"},
	})
	if err != nil {
		t.Fatal(err)
	}
	statuses := []string{"success", "success", "missing", "empty", "error", "error", "error"}
	if len(results) != len(statuses) {
		t.Fatalf("got %d results, want %d", len(results), len(statuses))
	}
	for index, status := range statuses {
		if results[index].Status != status {
			t.Errorf("row %d: got status %q, want %q", index, results[index].Status, status)
		}
	}
	if results[0].Token != "json-token +/==" || results[1].Token != "raw-token" {
		t.Fatal("token contents were changed or JSON was not extracted")
	}
	if results[0].UserID != "101" || results[0].Key != "l:usr:token:101" {
		t.Fatal("userID/key mapping is incorrect")
	}
	if value, _ := server.Get("l:usr:token:101"); value != payload || server.TTL("l:usr:token:101") != time.Hour {
		t.Fatal("query changed the stored value or expiration")
	}
}

func TestTokenQuerySelectsDatabase(t *testing.T) {
	server := miniredis.RunT(t)
	server.Set("l:usr:token:42", "db-zero")
	server.Select(1)
	server.Set("l:usr:token:42", `"db-one"`)
	results, err := new(TokenService).Query(t.Context(), TokenQueryRequest{Host: server.Addr(), DB: 1, UserIDs: []string{"42"}})
	if err != nil || len(results) != 1 || results[0].Token != "db-one" {
		t.Fatalf("database selection failed: %v", err)
	}
}

func TestTokenQueryRejectsInvalidRequests(t *testing.T) {
	requests := []TokenQueryRequest{
		{Host: "bad-address", UserIDs: []string{"1"}},
		{Host: "localhost:99999", UserIDs: []string{"1"}},
		{Host: "localhost:6379", DB: -1, UserIDs: []string{"1"}},
		{Host: "localhost:6379", UserIDs: []string{"1 2"}},
		{Host: "localhost:6379", UserIDs: []string{"-1"}},
		{Host: "localhost:6379", UserIDs: []string{"18446744073709551616"}},
		{Host: "localhost:6379", UserIDs: []string{" "}},
		{Host: "localhost:6379", UserIDs: make([]string, 1001)},
	}
	for index, request := range requests {
		if _, err := new(TokenService).Query(t.Context(), request); err == nil {
			t.Errorf("invalid request %d was accepted", index)
		}
	}
}

func TestTokenQueryConnectionFailureAndCancellation(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	listener.Close()
	if _, err := new(TokenService).Query(t.Context(), TokenQueryRequest{Host: address, UserIDs: []string{"1"}}); err == nil {
		t.Fatal("connection failure was not reported")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := new(TokenService).Query(ctx, TokenQueryRequest{Host: address, UserIDs: []string{"1"}}); err == nil {
		t.Fatal("cancelled query was not stopped")
	}
}

func TestExtractRedisToken(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{`{"token":"abc","extra":{"token":"other"}}`, "abc"},
		{`{"Token":"case-compatible"}`, "case-compatible"},
		{`"encoded-token"`, "encoded-token"},
		{"  raw-token  ", "  raw-token  "},
		{"", ""},
	}
	for _, item := range cases {
		got, err := extractRedisToken(item.input)
		if err != nil || got != item.want {
			t.Errorf("extract failed for fixture: %v", err)
		}
	}
	for _, input := range []string{`{"token":null}`, `{"token":1}`, `{broken}`, `[]`, `"broken`} {
		if _, err := extractRedisToken(input); err == nil || strings.Contains(err.Error(), input) {
			t.Fatal("invalid token payload should fail without including the stored value in the error")
		}
	}
}

func TestTokenQuerySentinelDiscoversMaster(t *testing.T) {
	master := miniredis.RunT(t)
	master.Select(1)
	master.Set("l:usr:token:42", `{"token":"sentinel-token"}`)
	sentinel := miniredis.RunT(t)
	host, port, _ := net.SplitHostPort(master.Addr())
	if err := sentinel.Server().Register("SENTINEL", func(peer *server.Peer, _ string, args []string) {
		switch {
		case len(args) == 2 && strings.EqualFold(args[0], "get-master-addr-by-name") && args[1] == "test-master":
			peer.WriteStrings([]string{host, port})
		case len(args) == 2 && strings.EqualFold(args[0], "sentinels"):
			peer.WriteLen(0)
		default:
			peer.WriteNull()
		}
	}); err != nil {
		t.Fatal(err)
	}
	results, err := new(TokenService).Query(t.Context(), TokenQueryRequest{
		Mode: "sentinel", SentinelHosts: []string{sentinel.Addr()}, MasterName: "test-master", DB: 1, UserIDs: []string{"42"},
	})
	if err != nil || len(results) != 1 || results[0].Token != "sentinel-token" {
		t.Fatalf("Sentinel master discovery/query failed: %v", err)
	}
}

func TestTokenQueryRejectsInvalidSentinelConfiguration(t *testing.T) {
	requests := []TokenQueryRequest{
		{Mode: "sentinel", MasterName: "test-master"},
		{Mode: "sentinel", SentinelHosts: []string{"localhost:26379"}},
		{Mode: "sentinel", MasterName: "test-master", SentinelHosts: []string{"bad-address"}},
		{Mode: "unknown", Host: "localhost:6379"},
	}
	for index, request := range requests {
		request.UserIDs = []string{"1"}
		if _, err := new(TokenService).Query(t.Context(), request); err == nil {
			t.Errorf("invalid Sentinel configuration %d was accepted", index)
		}
	}
}
