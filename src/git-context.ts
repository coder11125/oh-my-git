import type { StatusResult } from 'simple-git';

export interface UpstreamInfo {
  currentBranch: string | null;
  trackingBranch: string | null;
  remoteName: string | null;
  remoteBranch: string | null;
}

export function getUpstreamInfo(status: StatusResult): UpstreamInfo {
  const trackingBranch = status.tracking ?? null;
  const currentBranch = status.current ?? null;

  if (!trackingBranch) {
    return {
      currentBranch,
      trackingBranch: null,
      remoteName: null,
      remoteBranch: null,
    };
  }

  const slashIndex = trackingBranch.indexOf('/');
  if (slashIndex === -1) {
    return {
      currentBranch,
      trackingBranch,
      remoteName: null,
      remoteBranch: trackingBranch,
    };
  }

  return {
    currentBranch,
    trackingBranch,
    remoteName: trackingBranch.slice(0, slashIndex) || null,
    remoteBranch: trackingBranch.slice(slashIndex + 1) || null,
  };
}
