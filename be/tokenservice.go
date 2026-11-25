package be

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/redis/go-redis/v9/maintnotifications"
)

const maxTokenQueryUsers = 1000

type TokenQueryRequest struct {
	Mode          string   `json:"mode"`
	Host          string   `json:"host"`
	SentinelHosts []string `json:"sentinelHosts"`
	MasterName    string   `json:"masterName"`
	DB            int      `json:"db"`
	UserIDs       []string `json:"userIDs"`
}

type TokenResult struct {
	UserID  string `json:"userID"`
	Key     string `json:"key"`
	Token   string `json:"token"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type redisTokenPayload struct {
	Token *string `json:"token"`
}

type TokenService struct{}

// Query reads only the requested keys. Tokens are returned to the UI without logging or caching them.
func (*TokenService) Query(ctx context.Context, request TokenQueryRequest) ([]TokenResult, error) {
	if request.DB < 0 || request.DB > 65535 {
		return nil, errors.New("Redis DB 必须是 0–65535 之间的整数")
	}
	userIDs, err := normalizeTokenUserIDs(request.UserIDs)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	client, source, err := tokenRedisClient(request)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	pipeline := client.Pipeline()
	commands := make([]*redis.StringCmd, len(userIDs))
	for index, userID := range userIDs {
		commands[index] = pipeline.Get(ctx, "l:usr:token:"+userID)
	}
	if _, err := pipeline.Exec(ctx); err != nil && !errors.Is(err, redis.Nil) {
		if _, isRedisError := errors.AsType[redis.Error](err); !isRedisError {
			return nil, fmt.Errorf("Redis 连接或读取失败（%s / DB %d）：%w", source, request.DB, err)
		}
	}

	results := make([]TokenResult, len(userIDs))
	for index, command := range commands {
		result := TokenResult{UserID: userIDs[index], Key: "l:usr:token:" + userIDs[index]}
		value, err := command.Result()
		switch {
		case errors.Is(err, redis.Nil):
			result.Status, result.Message = "missing", "Key 不存在或已过期"
		case err != nil:
			result.Status, result.Message = "error", err.Error()
		default:
			token, err := extractRedisToken(value)
			switch {
			case err != nil:
				result.Status, result.Message = "error", err.Error()
			case token == "":
				result.Status, result.Message = "empty", "Token 为空"
			default:
				result.Status, result.Token = "success", token
			}
		}
		results[index] = result
	}
	return results, nil
}

func normalizeTokenUserIDs(input []string) ([]string, error) {
	if len(input) == 0 {
		return nil, errors.New("请至少输入一个 userID，每行一个")
	}
	if len(input) > maxTokenQueryUsers {
		return nil, fmt.Errorf("单次最多查询 %d 个 userID", maxTokenQueryUsers)
	}
	result := make([]string, 0, len(input))
	seen := make(map[string]bool, len(input))
	for _, value := range input {
		text := strings.TrimSpace(value)
		if text == "" {
			continue
		}
		// Reject signs and embedded whitespace instead of silently changing the requested key.
		for _, digit := range text {
			if digit < '0' || digit > '9' {
				return nil, fmt.Errorf("无效 userID：%s，请每行输入一个非负整数", text)
			}
		}
		number, err := strconv.ParseUint(text, 10, 64)
		if err != nil {
			return nil, errors.New("userID 超出 64 位无符号整数范围")
		}
		userID := strconv.FormatUint(number, 10)
		if !seen[userID] {
			seen[userID] = true
			result = append(result, userID)
		}
	}
	if len(result) == 0 {
		return nil, errors.New("请至少输入一个 userID，每行一个")
	}
	return result, nil
}

func extractRedisToken(value string) (string, error) {
	text := strings.TrimSpace(value)
	if strings.HasPrefix(text, "{") {
		var payload redisTokenPayload
		if err := json.Unmarshal([]byte(text), &payload); err != nil {
			return "", errors.New("Redis 值不是有效的 token JSON，或 token 字段不是字符串")
		}
		if payload.Token == nil {
			return "", errors.New("Redis JSON 中缺少字符串类型的 token 字段")
		}
		return *payload.Token, nil
	}
	if strings.HasPrefix(text, `"`) {
		var token string
		if err := json.Unmarshal([]byte(text), &token); err != nil {
			return "", errors.New("Redis 值不是有效的 JSON 字符串")
		}
		return token, nil
	}
	if strings.HasPrefix(text, "[") {
		return "", errors.New("Redis 值是 JSON 数组，无法提取 token")
	}
	return value, nil
}

func validateRedisAddress(address string) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil || host == "" {
		return errors.New("Redis 地址格式应为 host:port，例如 127.0.0.1:6379")
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return errors.New("Redis 端口必须在 1–65535 之间")
	}
	return nil
}

func tokenRedisClient(request TokenQueryRequest) (*redis.Client, string, error) {
	switch request.Mode {
	case "", "standalone":
		address := strings.TrimSpace(request.Host)
		if err := validateRedisAddress(address); err != nil {
			return nil, "", err
		}
		return redis.NewClient(&redis.Options{
			Addr: address, DB: request.DB, Protocol: 2,
			DialTimeout: 3 * time.Second, DialerRetries: 1,
			ReadTimeout: 4 * time.Second, WriteTimeout: 3 * time.Second,
			ContextTimeoutEnabled: true, MaxRetries: -1, PoolSize: 1, MaxActiveConns: 1,
			PipelinePoolSize: -1, DisableIdentity: true,
			MaintNotificationsConfig: &maintnotifications.Config{Mode: maintnotifications.ModeDisabled},
		}), address, nil
	case "sentinel":
		master := strings.TrimSpace(request.MasterName)
		if master == "" {
			return nil, "", errors.New("请填写 Sentinel Master 名称")
		}
		addresses := make([]string, 0, len(request.SentinelHosts))
		seen := make(map[string]bool)
		for index, value := range request.SentinelHosts {
			address := strings.TrimSpace(value)
			if err := validateRedisAddress(address); err != nil {
				return nil, "", fmt.Errorf("Sentinel 节点 %d：%w", index+1, err)
			}
			if !seen[address] {
				seen[address] = true
				addresses = append(addresses, address)
			}
		}
		if len(addresses) == 0 {
			return nil, "", errors.New("请至少填写一个 Sentinel 节点")
		}
		return redis.NewFailoverClient(&redis.FailoverOptions{
			MasterName: master, SentinelAddrs: addresses, DB: request.DB, Protocol: 2,
			DialTimeout: 3 * time.Second, DialerRetries: 1,
			ReadTimeout: 4 * time.Second, WriteTimeout: 3 * time.Second,
			ContextTimeoutEnabled: true, MaxRetries: -1, PoolSize: 1, MaxActiveConns: 1,
			PipelinePoolSize: -1, DisableIdentity: true,
		}), "Sentinel " + master, nil
	default:
		return nil, "", errors.New("不支持的 Redis 连接模式")
	}
}
