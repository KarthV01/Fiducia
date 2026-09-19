export const PROFILE_ROLE = {
  sponsor: "sponsor",
  creator: "creator",
} as const;

export const CONTRACT_INVITE_STATUS = {
  pending: "pending",
  accepted: "accepted",
} as const;

export const DISCOVERY_METRICS = [
  {
    key: "youtube.video.views",
    label: "YouTube video views",
    unit: "views",
    description: "Public view count for a sponsored video.",
  },
  {
    key: "youtube.video.likes",
    label: "YouTube video likes",
    unit: "likes",
    description: "Public like count for a sponsored video.",
  },
  { key: "youtube.video.comments", label: "YouTube video comments", unit: "comments", description: "Public comment count for a sponsored video." },
  { key: "youtube.video.engaged_views", label: "YouTube engaged views", unit: "views", description: "Owner-authorized engaged views for sponsored content." },
  { key: "youtube.video.watch_minutes", label: "YouTube watch minutes", unit: "minutes", description: "Owner-authorized minutes watched during the measurement interval." },
  { key: "youtube.video.average_view_duration_seconds", label: "YouTube average view duration", unit: "seconds", description: "Owner-authorized average playback duration." },
  { key: "youtube.video.average_view_percentage", label: "YouTube average viewed percentage", unit: "percent", description: "Owner-authorized average percentage viewed." },
  { key: "youtube.video.shares", label: "YouTube video shares", unit: "shares", description: "Owner-authorized shares for sponsored content." },
  { key: "youtube.video.subscribers_gained", label: "YouTube subscribers gained", unit: "subscribers", description: "Subscribers attributed to the sponsored video by YouTube Analytics." },
  { key: "instagram.media.views", label: "Instagram media views", unit: "views", description: "Owner-authorized views for sponsored Instagram media." },
  { key: "instagram.media.reach", label: "Instagram media reach", unit: "accounts", description: "Owner-authorized accounts reached by sponsored Instagram media." },
  { key: "instagram.media.likes", label: "Instagram media likes", unit: "likes", description: "Likes reported for sponsored Instagram media." },
  { key: "instagram.media.comments", label: "Instagram media comments", unit: "comments", description: "Comments reported for sponsored Instagram media." },
  { key: "instagram.media.saves", label: "Instagram media saves", unit: "saves", description: "Owner-authorized saves for sponsored Instagram media." },
  { key: "instagram.media.shares", label: "Instagram media shares", unit: "shares", description: "Owner-authorized shares for sponsored Instagram media." },
  { key: "x.post.impression", label: "X Post impressions", unit: "impressions", description: "Impressions returned by the connected X entitlement." },
  { key: "x.post.like", label: "X Post likes", unit: "likes", description: "Public likes for a sponsored X Post." },
  { key: "x.post.reply", label: "X Post replies", unit: "replies", description: "Public replies for a sponsored X Post." },
  { key: "x.post.retweet", label: "X Post reposts", unit: "reposts", description: "Public reposts for a sponsored X Post." },
  { key: "x.post.quote", label: "X Post quotes", unit: "quotes", description: "Public quotes for a sponsored X Post." },
  { key: "x.post.bookmark", label: "X Post bookmarks", unit: "bookmarks", description: "Bookmarks returned by the connected X entitlement." },
  { key: "tiktok.video.views", label: "TikTok video views", unit: "views", description: "Views for a sponsored public TikTok video." },
  { key: "tiktok.video.likes", label: "TikTok video likes", unit: "likes", description: "Likes for a sponsored public TikTok video." },
  { key: "tiktok.video.comments", label: "TikTok video comments", unit: "comments", description: "Comments for a sponsored public TikTok video." },
  { key: "tiktok.video.shares", label: "TikTok video shares", unit: "shares", description: "Shares for a sponsored public TikTok video." },
  {
    key: "shopify.referral.conversions",
    label: "Referral conversions",
    unit: "conversions",
    description: "Verified purchases from a campaign referral source.",
  },
] as const;

export const AUTO_SETTLEMENT_METRICS = new Set<string>(DISCOVERY_METRICS.filter((metric) => metric.key !== "shopify.referral.conversions").map((metric) => metric.key));

export function tokenForChain(chainId: number | undefined) {
  if (chainId === 8453 || chainId === 84532) {
    return {
      symbol: "USDC",
      decimals: 6,
    };
  }

  return {
    symbol: "mUSDC",
    decimals: 6,
  };
}
