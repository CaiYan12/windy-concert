// T3.1 channels —— §3.6 IPC 契约常量与类型（零逻辑）。
// T4.10 下沉留痕：IPC 常量与 IpcPayloads / IpcReturns / ChannelName 已整体迁至
//   src/shared/ipc.ts（消除 preload→main 目录反向耦合，Phase 4 前置收口）。
//   本文件降级为纯 re-export shim：main 侧既有调用方（ipc/index.ts、index.ts）零改动，
//   单一事实源在 shared/ipc.ts（shim 无任何自有定义，不存在双重真源）。
export { IPC } from '../../shared/ipc';
export type { ChannelName, IpcPayloads, IpcReturns } from '../../shared/ipc';
