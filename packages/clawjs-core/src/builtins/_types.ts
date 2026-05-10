export interface BuiltinRelationDefinition {
  collectionName: string;
}

export interface BuiltinFieldDefinition {
  name: string;
  type:
    | "text"
    | "number"
    | "boolean"
    | "date"
    | "json"
    | "select"
    | "relation"
    | "file"
    | "email"
    | "url";
  required?: boolean;
  options?: string[];
  relation?: BuiltinRelationDefinition;
}

export interface BuiltinIndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface BuiltinCollectionDefinition {
  name: string;
  displayName: string;
  family: string;
  aliases: string[];
  fields: BuiltinFieldDefinition[];
  indexes: BuiltinIndexDefinition[];
}

export interface BuiltinFamilyDefinition {
  name: string;
  displayName: string;
  description: string;
  collections: BuiltinCollectionDefinition[];
}
