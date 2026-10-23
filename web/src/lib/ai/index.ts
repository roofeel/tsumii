// Engine A：AI Inspiration Engine
// 业务逻辑只依赖 AIProvider 接口；默认使用 MockProvider（确定性、离线可用）。
// 接入真实图像生成模型时，新增一个实现并在 getProvider() 中按 AI_PROVIDER 环境变量切换。

import type { DesignIdea, DesignVariant, ParsedBrief } from '../types';
import { mockProvider } from './mock';

export interface GenerateRequest {
  prompt: string;
  brief: ParsedBrief;
  count: number;
}

export interface AIProvider {
  readonly name: string;
  generateIdeas(req: GenerateRequest): Promise<DesignIdea[]>;
  refine(idea: DesignIdea, instruction: string, parentVariantId?: string): Promise<DesignVariant>;
}

export function getProvider(name: string | undefined = process.env.AI_PROVIDER): AIProvider {
  switch (name) {
    case 'mock':
    case undefined:
    case '':
      return mockProvider;
    default:
      throw new Error(`未知的 AI_PROVIDER：${name}。请在 src/lib/ai 中实现对应 Provider。`);
  }
}

export { parsePrompt } from './parse';
