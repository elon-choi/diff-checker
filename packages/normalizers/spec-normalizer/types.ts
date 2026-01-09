import { UUMDocument } from "../../core-engine/src/types";

export interface Normalizer {
  canHandle(input: any): boolean;
  normalize(input: any): Promise<UUMDocument>;
}

import { UUMDocument } from "../../core-engine/src/types";

export interface Normalizer<Input = any> {
  canHandle(input: any): boolean;
  normalize(input: Input): Promise<UUMDocument>;
}


