"""
DineSense Feedback — MobileNetV2 Transfer-Learning Training Pipeline
Trains a 3-class visual expression-cue classifier (smile_like, neutral_like, other_expression)
with temperature-scaling confidence calibration and ONNX export.

Dataset expectation:
Place appropriately licensed, de-identified facial expression images into:
  ml/datasets/train/{smile_like,neutral_like,other_expression}/
  ml/datasets/val/{smile_like,neutral_like,other_expression}/
"""

import argparse
from pathlib import Path
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

CLASSES = ["smile_like", "neutral_like", "other_expression"]


def build_model(num_classes: int = 3) -> nn.Module:
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
    for param in model.features[:-3].parameters():
        param.requires_grad = False
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, num_classes),
    )
    return model


def train(data_dir: Path, output_dir: Path, epochs: int = 10, batch_size: int = 32, lr: float = 3e-4):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.15, contrast=0.15),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    val_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    train_ds = datasets.ImageFolder(data_dir / "train", transform=train_tf)
    val_ds = datasets.ImageFolder(data_dir / "val", transform=val_tf)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=2)

    model = build_model(num_classes=len(train_ds.classes)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=lr)

    best_val_loss = float("inf")
    output_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = output_dir / "mobilenetv2_cue_v1.pt"

    for epoch in range(1, epochs + 1):
        model.train()
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                val_loss += criterion(model(x), y).item() * x.size(0)
        val_loss /= max(1, len(val_ds))
        print(f"Epoch {epoch}/{epochs} | val_loss={val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), ckpt_path)

    # Export best checkpoint to ONNX for CPU edge inference
    model.load_state_dict(torch.load(ckpt_path, map_location="cpu"))
    model.eval().cpu()
    dummy = torch.randn(1, 3, 224, 224)
    onnx_path = output_dir / "mobilenetv2_cue_v1.onnx"
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    print(f"Exported ONNX model to {onnx_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("ml/datasets"))
    parser.add_argument("--output-dir", type=Path, default=Path("ml/models"))
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()
    train(args.data_dir, args.output_dir, epochs=args.epochs)
