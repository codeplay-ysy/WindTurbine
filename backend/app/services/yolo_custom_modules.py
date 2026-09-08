import sys
import types

import torch
import torch.nn as nn
from ultralytics.nn.modules import Conv, GhostConv


class RDWConv(nn.Module):
    def __init__(self, c1, c2, k=3, s=1, p=None, g=1, act=True):
        super().__init__()
        if p is None:
            p = k // 2

        self.pointwise = nn.Conv2d(c1, c1, kernel_size=1, stride=1, padding=0, bias=False)
        self.pw_bn = nn.BatchNorm2d(c1)
        self.depthwise = nn.Conv2d(c1, c1, kernel_size=k, stride=s, padding=p, groups=c1, bias=False)
        self.dw_bn = nn.BatchNorm2d(c1)
        self.output = nn.Conv2d(c1, c2, kernel_size=1, stride=1, padding=0, bias=False)
        self.out_bn = nn.BatchNorm2d(c2)
        self.act = nn.SiLU() if act is True else (act if isinstance(act, nn.Module) else nn.Identity())

    def forward(self, x):
        x = self.pointwise(x)
        x = self.pw_bn(x)
        x = self.act(x)
        x = self.depthwise(x)
        x = self.dw_bn(x)
        x = self.act(x)
        x = self.output(x)
        x = self.out_bn(x)
        x = self.act(x)
        return x


class GhostCBS(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=1, stride=1, groups=1, act=True):
        super().__init__()
        self.ghost_conv = GhostConv(in_channels, out_channels, kernel_size, stride, groups, act=act)

    def forward(self, x):
        return self.ghost_conv(x)


class DFSConv(nn.Module):
    def __init__(self, in_channels, out_channels, stride=1):
        super().__init__()
        self.primary = GhostCBS(in_channels, out_channels // 2, kernel_size=1)
        hidden = out_channels // 2
        self.conv_h = nn.Conv2d(hidden, hidden, (1, 3), stride=stride, padding=(0, 1), groups=hidden, bias=False)
        self.conv_v = nn.Conv2d(hidden, hidden, (3, 1), 1, padding=(1, 0), groups=hidden, bias=False)
        self.bn = nn.BatchNorm2d(hidden)
        self.act = nn.SiLU(inplace=True)

    def forward(self, x):
        x1 = self.primary(x)
        x2 = self.conv_h(x1)
        x2 = self.conv_v(x2)
        x2 = self.bn(x2)
        x2 = self.act(x2)
        return torch.cat([x1, x2], dim=1)


class DFSB(nn.Module):
    def __init__(self, in_channels, out_channels, stride=1, use_residual=True):
        super().__init__()
        self.use_residual = use_residual and (in_channels == out_channels) and stride == 1
        self.conv1 = GhostCBS(in_channels, out_channels // 2, kernel_size=1)
        self.dfs_conv = DFSConv(out_channels // 2, out_channels // 2, stride=stride)
        self.conv2 = Conv(out_channels // 2, out_channels, k=1)

    def forward(self, x):
        residual = x
        x = self.conv1(x)
        x = self.dfs_conv(x)
        x = self.conv2(x)
        if self.use_residual:
            x += residual
        return x


class DFSB_C2f(nn.Module):
    def __init__(self, c1, c2, shortcut=True, n=1, e=0.5):
        super().__init__()
        self.c = int(c2 * e)
        self.n = n
        self.shortcut = shortcut
        self.cv1 = GhostCBS(c1, 2 * self.c, 1)
        self.m = nn.ModuleList(DFSB(self.c, self.c, use_residual=shortcut) for _ in range(n))
        self.cv2 = GhostCBS((2 + n) * self.c, c2, 1)

    def forward(self, x):
        y = list(self.cv1(x).chunk(2, 1))
        y.extend(m(y[-1]) for m in self.m)
        return self.cv2(torch.cat(y, 1))


def _register_module(module_name, symbols):
    module = types.ModuleType(module_name)
    for name, value in symbols.items():
        setattr(module, name, value)
    sys.modules[module_name] = module


def register_custom_modules():
    _register_module("ultralytics.nn.modules.RDWConv", {"RDWConv": RDWConv})
    _register_module(
        "ultralytics.nn.modules.DFSB",
        {
            "GhostCBS": GhostCBS,
            "DFSConv": DFSConv,
            "DFSB": DFSB,
            "DFSB_C2f": DFSB_C2f,
        },
    )
