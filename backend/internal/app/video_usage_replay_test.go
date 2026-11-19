package app

import (
	"os"
	"testing"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

// TestReplayRealGatewayPayload 用中转网关真实响应报文回放采集链路。
// 报文由运维从线上 api_call_logs 导出，放在 YINGCE_VIDEO_USAGE_REPLAY 指向的路径；
// 该变量未设置时跳过，避免开发机或 CI 依赖外部文件。
func TestReplayRealGatewayPayload(t *testing.T) {
	path := os.Getenv("YINGCE_VIDEO_USAGE_REPLAY")
	if path == "" {
		t.Skip("set YINGCE_VIDEO_USAGE_REPLAY to a gateway response body to replay")
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read replay payload: %v", err)
	}
	log := &model.ApiCallLog{Capability: "video", Path: "/v1/video/generations", StatusCode: 200}
	(&Service{}).EnrichAPICallLog(log, body)
	// 该报文对应 6 秒 480p 任务，上游 usage.actual_token 为 30600。
	if !log.UsageAvailable || log.OutputTokens != 30600 {
		t.Fatalf("replayed gateway payload = output:%d available:%v, want 30600/true", log.OutputTokens, log.UsageAvailable)
	}
	if log.InputTokens != 0 || log.CachedTokens != 0 || log.CacheWriteTokens != 0 {
		t.Fatalf("video usage must not carry text tokens: %#v", log)
	}
	// 采信上游用量后必须按 provider 口径结算：30600 tokens × 23 积分/M = 0.7038 积分，
	// 而不是本地公式固化的 59220 tokens × 23 积分/M = 1.36206 积分。
	amount, err := kernel.TokenBillingAmount(10000, kernel.TokenBillingTerm{Tokens: log.OutputTokens, PriceMicrocredits: 23_000_000})
	if err != nil {
		t.Fatal(err)
	}
	if amount != 703_800 {
		t.Fatalf("settled microcredits = %d, want 703800", amount)
	}
}
