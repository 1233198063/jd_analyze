// Mirrors backend/app/services/scorer.py LOCATION_REGIONS (labels only — the
// allow/reject decision itself is made server-side).
const REGION_KEYWORDS = [
  ["China", ["china", "shanghai", "beijing", "shenzhen", "greater china"]],
  ["UK", ["united kingdom", "london", "uk"]],
  ["Canada", ["canada", "toronto", "vancouver", "montreal"]],
  ["India", ["india", "bengaluru", "bangalore", "hyderabad", "mumbai", "delhi", "pune", "chennai"]],
  ["Germany", ["germany", "berlin", "munich"]],
  ["Ireland", ["ireland", "dublin"]],
  ["Singapore", ["singapore"]],
  ["Australia", ["australia", "sydney", "melbourne"]],
  ["Japan", ["japan", "tokyo"]],
  ["Poland", ["poland", "warsaw", "krakow"]],
  ["Netherlands", ["netherlands", "amsterdam"]],
  ["France", ["france", "paris"]],
  ["Spain", ["spain", "madrid", "barcelona"]],
  ["Italy", ["italy", "milan"]],
  ["Switzerland", ["switzerland", "zurich"]],
  ["Sweden", ["sweden", "stockholm"]],
  ["Portugal", ["portugal", "lisbon"]],
  ["Brazil", ["brazil", "sao paulo"]],
  ["Mexico", ["mexico"]],
  ["Colombia", ["colombia", "bogota"]],
  ["Argentina", ["argentina", "buenos aires"]],
  ["Chile", ["chile", "santiago"]],
  ["Romania", ["romania", "bucharest"]],
  ["Ukraine", ["ukraine", "kyiv"]],
  ["Israel", ["israel", "tel aviv"]],
  ["Philippines", ["philippines", "manila"]],
  ["South Korea", ["south korea", "seoul"]],
  ["Vietnam", ["vietnam", "hanoi"]],
  ["Indonesia", ["indonesia", "jakarta"]],
  ["Malaysia", ["malaysia", "kuala lumpur"]],
  ["Hong Kong", ["hong kong"]],
  ["Taiwan", ["taiwan", "taipei"]],
  ["New Zealand", ["new zealand", "auckland"]],
  ["Egypt", ["egypt", "cairo"]],
  ["South Africa", ["south africa"]],
  ["APAC", ["apjc", "apac"]],
  ["EMEA", ["emea"]],
  ["LATAM", ["latam"]],
];

// Returns a short region label for display: a matched foreign country/region,
// "Remote", "US" (default assumption when a location is given but no foreign
// match), or null when there's nothing to show.
export function getRegionLabel(location, isRemote) {
  if (location) {
    const loc = location.toLowerCase();
    for (const [label, keywords] of REGION_KEYWORDS) {
      if (keywords.some((kw) => new RegExp(`\\b${kw}\\b`).test(loc))) return label;
    }
  }
  if (isRemote) return "Remote";
  if (location) return "US";
  return null;
}
