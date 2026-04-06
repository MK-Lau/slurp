import type { GetProfileResponse, UpdateProfileRequest, UpdateProfileResponse } from "@slurp/types";
import { apiFetch } from "./api";

export const getProfile = (): Promise<GetProfileResponse> =>
  apiFetch<GetProfileResponse>("/profile");

export const updateProfile = (body: UpdateProfileRequest): Promise<UpdateProfileResponse> =>
  apiFetch<UpdateProfileResponse>("/profile", { method: "PUT", body: JSON.stringify(body) });
