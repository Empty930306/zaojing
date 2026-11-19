package app

import (
	"testing"
)

// 中转网关把图片响应逐层包进 data（实测即梦 agent 协议是 data.data.data）时，
// 原实现按最外层 struct 解析会读空产物与 usage，订单落到待核对。
func TestProxyImageResultReadsNestedDataLevels(t *testing.T) {
	body := []byte(`{"data":{"data":{"data":{"data":[{"url":"https://cdn.example.com/a.png","size":"2048x2048"}],"usage":{"input_images":1,"generated_images":1}}}}}`)
	result, err := proxyImageResult(body)
	if err != nil {
		t.Fatalf("proxyImageResult() error = %v", err)
	}
	if len(result.Images) != 1 || result.Images[0].URL != "https://cdn.example.com/a.png" {
		t.Fatalf("proxyImageResult() images = %#v", result.Images)
	}
	if result.Images[0].Metadata["size"] != "2048x2048" {
		t.Fatalf("proxyImageResult() size = %#v", result.Images[0].Metadata)
	}
	count, ok := firstInt64Value(result.Usage, "input_images")
	if !ok || count != 1 {
		t.Fatalf("proxyImageResult() usage = %#v", result.Usage)
	}
}

// 外层同名字段优先，避免深层网关改写协议原始字段。
func TestProxyImageResultKeepsOuterFields(t *testing.T) {
	body := []byte(`{"data":[{"url":"https://cdn.example.com/outer.png","size":"1024x1024"}],"usage":{"input_images":2},"data_extra":{"data":[{"url":"https://cdn.example.com/inner.png"}]}}`)
	result, err := proxyImageResult(body)
	if err != nil {
		t.Fatalf("proxyImageResult() error = %v", err)
	}
	if len(result.Images) != 1 || result.Images[0].URL != "https://cdn.example.com/outer.png" {
		t.Fatalf("proxyImageResult() images = %#v", result.Images)
	}
}

// 支持 b64_json 内联产物与 output_format，仍转成 data URL。
func TestProxyImageResultDecodesInlineBase64(t *testing.T) {
	body := []byte(`{"data":[{"b64_json":"aGVsbG8=","output_format":"jpeg","size":"1024x1024"}]}`)
	result, err := proxyImageResult(body)
	if err != nil {
		t.Fatalf("proxyImageResult() error = %v", err)
	}
	if len(result.Images) != 1 || result.Images[0].DataURL != "data:image/jpeg;base64,aGVsbG8=" {
		t.Fatalf("proxyImageResult() images = %#v", result.Images)
	}
}

// 无效 JSON 必须报错，由调用方转待核对，不能静默当作成功。
func TestProxyImageResultRejectsInvalidJSON(t *testing.T) {
	if _, err := proxyImageResult([]byte("not json")); err == nil {
		t.Fatal("proxyImageResult() accepted invalid JSON")
	}
}

// usage 藏在嵌套 data 里时也能取到，结算才不会因缺少张数校验而失败。
func TestProxyImageResultReadsNestedUsage(t *testing.T) {
	body := []byte(`{"data":{"usage":{"input_images":1,"generated_images":1},"data":[{"url":"https://cdn.example.com/a.png","size":"1536x1536"}]}}`)
	result, err := proxyImageResult(body)
	if err != nil {
		t.Fatalf("proxyImageResult() error = %v", err)
	}
	if len(result.Usage) == 0 {
		t.Fatal("proxyImageResult() did not lift nested usage")
	}
	if len(result.Images) != 1 {
		t.Fatalf("proxyImageResult() images = %#v", result.Images)
	}
}
