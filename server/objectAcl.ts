// Simplified ACL for 247 Print Network
// All artist artwork uploads are public by default
// This file exists for potential future private content needs

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

// For now, all artwork is public - no complex ACL needed
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}
