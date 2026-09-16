export type ApplicationInput = {
  name: string;
  slug: string;
  description: string;
};

export type FlagInput = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  applicationIds: string[];
};

/** Fields the API assigns to every stored resource. */
type StoredFields = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type Application = StoredFields & ApplicationInput;

export type FeatureFlag = StoredFields & FlagInput;
