import type { SocialProfile } from "../lib/types";

export function ProfileAvatar({ profile, small = false }: { profile: Pick<SocialProfile, "avatarUrl" | "displayName">; small?: boolean }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent-rule bg-accent-soft font-semibold text-link ${small ? "h-8 w-8 text-xs" : "h-10 w-10"}`}>
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}
