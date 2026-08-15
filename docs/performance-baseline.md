# Mpx 微信示例构建性能基线

> 记录日期：2026-08-15。结果仅反映本机一次测量，用于后续调试插件的相对对比，不作为通用性能承诺。

## 环境

| 项目     | 值                    |
| -------- | --------------------- |
| 操作系统 | macOS 26.5.2（arm64） |
| Node.js  | v24.16.0              |
| pnpm     | 11.10.0               |
| Mpx CLI  | 2.2.30                |
| Webpack  | 5.109.2               |
| 示例     | `examples/wx-minimal` |

## 命令与结果

构建命令：

```bash
pnpm --filter @mpxjs/debug-example-wx-minimal build:wx
```

使用 `/usr/bin/time -p` 测量 wall time：

| 场景     | 准备方式                                     | Mpx 编译日志 | Wall time |
| -------- | -------------------------------------------- | -----------: | --------: |
| 首次编译 | 删除示例的 `dist/` 与 `.cache/` 后构建       |      1009 ms |    3.53 s |
| 增量编译 | 保留缓存，修改并还原一个无语义样式注释后构建 |       511 ms |    1.10 s |

两次构建均成功生成微信小程序产物，包括 `app.json` 与 `pages/index.wxml`。

## 复测步骤

```bash
cd /Users/hui/Projects/mpx-devtools
rm -rf examples/wx-minimal/dist examples/wx-minimal/.cache
/usr/bin/time -p pnpm --filter @mpxjs/debug-example-wx-minimal build:wx
```

随后对 `examples/wx-minimal/src/pages/index.mpx` 做一次微小改动并再次运行同一命令，即可测量增量构建。
