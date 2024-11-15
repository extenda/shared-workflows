import type { YAMLMap } from "yaml";

export type Environment = "staging" | "production";
export const serviceTypeValues = [
  "INPUT_API",
  "STATEFUL_PROCESSOR",
  "STATELESS_PROCESSOR",
  "QUERY_API",
] as const;

export type ServiceType = (typeof serviceTypeValues)[number];

export interface EnvVarTemplate {
  keySuffix: string;
  value?: string;
}

export interface MismatchedVar {
  variableName: string;
  expectedValue: string;
  actualValue: string;
  comment?: string;
}

export interface ValidationResult {
  filePath: string;
  environment: Environment;
  missingVars: string[];
  mismatchedVars: MismatchedVar[];
}

export interface ParsedYaml {
  environments?: {
    [env: string]: {
      env?: {
        [key: string]: string;
      };
    };
  };
}

export interface ServiceTemplates {
  staging: EnvVarTemplate[];
  production: EnvVarTemplate[];
}

export interface AnchorMap {
  [anchor: string]: YAMLMap;
}
