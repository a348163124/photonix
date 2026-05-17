import { invoke, isTauri } from "./invoke";
import type { EditCandidate } from "@/types";

interface RawEditCandidateRow {
  id: string;
  image_id: string;
  version_id: string | null;
  candidate_group_id: string;
  label: string;
  prompt_modifier: string | null;
  style_profile_id: string | null;
  is_favorite: boolean;
  created_at: string;
}

function rowToCandidate(row: RawEditCandidateRow): EditCandidate {
  return {
    id: row.id,
    imageId: row.image_id,
    versionId: row.version_id,
    candidateGroupId: row.candidate_group_id,
    label: row.label,
    promptModifier: row.prompt_modifier,
    styleProfileId: row.style_profile_id,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
  };
}

function candidateToRow(c: EditCandidate): RawEditCandidateRow {
  return {
    id: c.id,
    image_id: c.imageId,
    version_id: c.versionId,
    candidate_group_id: c.candidateGroupId,
    label: c.label,
    prompt_modifier: c.promptModifier,
    style_profile_id: c.styleProfileId,
    is_favorite: c.isFavorite,
    created_at: c.createdAt,
  };
}

export async function recordCandidate(candidate: EditCandidate): Promise<void> {
  if (!isTauri()) return;
  await invoke("record_candidate", { candidate: candidateToRow(candidate) });
}

export async function listCandidatesForImage(
  imageId: string
): Promise<EditCandidate[]> {
  if (!isTauri()) return [];
  const rows = await invoke<RawEditCandidateRow[]>("list_candidates_for_image", {
    imageId,
  });
  return rows.map(rowToCandidate);
}

export async function setCandidateFavorite(
  id: string,
  isFavorite: boolean
): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_candidate_favorite", { id, isFavorite });
}

export async function deleteCandidate(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_candidate", { id });
}
