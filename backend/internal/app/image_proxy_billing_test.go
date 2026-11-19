package app

import (
	"testing"

	"yingce/backend/internal/model"
)

// 网关把响应逐层包进 data 时，系统代理的图片订单也必须能记录用量。
//
// 修复前 RecordProxyImageBillingUsage 按最外层 struct 解析，产物读成空，
// recordProtocolImageUsage 随即因「图片实际用量不可用」失败，订单落到待核对。
func TestRecordProxyImageBillingUsageReadsNestedGatewayPayload(t *testing.T) {
	s, db := imageBillingService(t)
	order := &model.BillingOrder{
		ID: "nested-image-order", UserID: "image-user", IdempotencyKey: "nested-image",
		Capability: "image", BillingMode: "image_usage", Status: model.BillingStatusRunning,
		ImageInputImages: 1, ImageMaxOutputImages: 1,
		ImagePricing: &model.ImagePricing{InputPriceMicrocredits: 50_000, OutputTiers: []model.ImagePriceTier{{MaxPixels: 2_610_000, UnitPriceMicrocredits: 130_000}}},
	}
	if err := db.Create(order).Error; err != nil {
		t.Fatal(err)
	}
	body := []byte(`{"data":{"data":{"data":{"data":[{"url":"https://cdn.example.com/nested.png","size":"1024x1024"}],"usage":{"input_images":1,"generated_images":1}}}}}`)
	log := model.ApiCallLog{BillingOrderID: order.ID, Capability: "image", Status: model.ApiCallStatusSucceeded}
	if err := s.RecordProxyImageBillingUsage(log, body); err != nil {
		t.Fatalf("RecordProxyImageBillingUsage() error = %v", err)
	}
	saved, err := s.repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if saved.ImageUsage == nil || len(saved.ImageUsage.Outputs) != 1 || saved.ImageUsage.Outputs[0].Width != 1024 {
		t.Fatalf("image usage = %#v", saved.ImageUsage)
	}
}

// 非 image_usage 计费的图片订单不该被这条路径改动。
func TestRecordProxyImageBillingUsageSkipsNonUsageBilling(t *testing.T) {
	s, db := imageBillingService(t)
	order := &model.BillingOrder{ID: "fixed-image-order", UserID: "image-user", IdempotencyKey: "fixed-image", Capability: "image", BillingMode: "fixed_request", Status: model.BillingStatusRunning}
	if err := db.Create(order).Error; err != nil {
		t.Fatal(err)
	}
	log := model.ApiCallLog{BillingOrderID: order.ID, Capability: "image", Status: model.ApiCallStatusSucceeded}
	if err := s.RecordProxyImageBillingUsage(log, []byte(`{"data":[{"url":"https://cdn.example.com/a.png","size":"1024x1024"}]}`)); err != nil {
		t.Fatalf("RecordProxyImageBillingUsage() error = %v", err)
	}
	saved, err := s.repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if saved.ImageUsage != nil {
		t.Fatalf("image usage recorded for fixed_request order: %#v", saved.ImageUsage)
	}
}
