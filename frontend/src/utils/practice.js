// Display order everywhere. A plan day only uses some of these: the two-week sprint has project /
// coding (react or leetcode) / english, the original 30-day plan has react / leetcode / system_design.
export const TRACK_ORDER = ["project", "react", "leetcode", "system_design", "english"];

export const TRACK_SHORT = {
  project: "项目深挖",
  react: "React / JS",
  leetcode: "LeetCode",
  system_design: "System Design",
  english: "英文表达",
};

export const TRACK_STYLE = {
  project: {
    icon: "work_history",
    bar: "bg-petrol-500",
    soft: "bg-petrol-50",
    text: "text-petrol-600",
    border: "border-petrol-200",
  },
  react: {
    icon: "code",
    bar: "bg-clay-500",
    soft: "bg-clay-50",
    text: "text-clay-700",
    border: "border-clay-200",
  },
  leetcode: {
    icon: "data_object",
    bar: "bg-plum-500",
    soft: "bg-plum-50",
    text: "text-plum-700",
    border: "border-plum-200",
  },
  system_design: {
    icon: "account_tree",
    bar: "bg-gold-500",
    soft: "bg-gold-50",
    text: "text-gold-700",
    border: "border-gold-200",
  },
  english: {
    icon: "translate",
    bar: "bg-sage-500",
    soft: "bg-sage-50",
    text: "text-sage-700",
    border: "border-sage-200",
  },
};

// Heatmap cell colours by level: 0 nothing, 1 under half, 2 at least half, 3 full target.
export const LEVEL_STYLE = ["bg-mist/50", "bg-sage-200", "bg-sage-400", "bg-sage-600"];

export const DIFFICULTY_STYLE = {
  easy: "bg-sage-100 text-sage-700",
  medium: "bg-gold-100 text-gold-700",
  hard: "bg-coral-100 text-coral-700",
};
