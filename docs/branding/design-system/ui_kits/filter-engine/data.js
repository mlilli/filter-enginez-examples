/* global window */

// ---------- Real Estate ----------
const realEstate = {
  id: "real-estate",
  name: "Real estate",
  domain: "san francisco listings · q4 2024",
  total: 1679,
  filters: [
    {
      id: "neighborhood",
      title: "Neighborhood",
      type: "checkbox",
      options: [
        { id: "soma", label: "SoMa", count: 287 },
        { id: "mission", label: "Mission", count: 221 },
        { id: "pac-heights", label: "Pacific Heights", count: 184 },
        { id: "hayes-valley", label: "Hayes Valley", count: 142 },
        { id: "noe-valley", label: "Noe Valley", count: 118 },
        { id: "presidio", label: "Presidio Heights", count: 0 },
      ],
    },
    {
      id: "price",
      title: "Price",
      type: "range",
      min: 450000, max: 4500000,
      lo: 800000, hi: 1800000,
      format: (n) => "$" + (n >= 1000000 ? (n/1000000).toFixed(2) + "M" : (n/1000).toFixed(0) + "k"),
      histogram: [22, 48, 72, 88, 65, 55, 38, 30, 22, 18, 12, 8],
    },
    {
      id: "bedrooms",
      title: "Bedrooms",
      type: "checkbox",
      options: [
        { id: "1", label: "1 bed", count: 312 },
        { id: "2", label: "2 bed", count: 487 },
        { id: "3", label: "3 bed", count: 542 },
        { id: "4", label: "4+ bed", count: 338 },
      ],
    },
    {
      id: "property",
      title: "Property type",
      type: "checkbox",
      options: [
        { id: "condo", label: "Condo", count: 612 },
        { id: "single", label: "Single family", count: 478 },
        { id: "town", label: "Townhouse", count: 318 },
        { id: "multi", label: "Multi-family", count: 271 },
      ],
    },
  ],
  results: [
    { id: "re1", title: "1247 Mission St · SoMa", price: 1247500, attrs: ["3 bd", "2 ba", "1,840 sqft"], badge: "NEW", icon: "home" },
    { id: "re2", title: "88 Pacific Ave · Pacific Heights", price: 2895000, attrs: ["4 bd", "3.5 ba", "3,210 sqft"], badge: "FEATURED", icon: "home" },
    { id: "re3", title: "215 Buchanan St · Hayes Valley", price: 1689000, attrs: ["3 bd", "2 ba", "1,920 sqft"], icon: "home" },
    { id: "re4", title: "742 Sanchez St · Noe Valley", price: 1985000, attrs: ["3 bd", "2.5 ba", "2,140 sqft"], icon: "home" },
    { id: "re5", title: "1124 Folsom St · SoMa", price: 925000, attrs: ["1 bd", "1 ba", "740 sqft"], badge: "NEW", icon: "home" },
    { id: "re6", title: "318 Valencia St · Mission", price: 1485000, attrs: ["2 bd", "2 ba", "1,420 sqft"], icon: "home" },
    { id: "re7", title: "412 Steiner St · Alamo Sq.", price: 3245000, attrs: ["4 bd", "3 ba", "2,840 sqft"], badge: "FEATURED", icon: "home" },
    { id: "re8", title: "67 Castro St · Castro", price: 1175000, attrs: ["2 bd", "1.5 ba", "1,180 sqft"], icon: "home" },
  ],
};

// ---------- Wine ----------
const wine = {
  id: "wine",
  name: "Wine",
  domain: "european cellar · ~3,200 bottles",
  total: 3214,
  filters: [
    {
      id: "region",
      title: "Region",
      type: "checkbox",
      options: [
        { id: "burgundy", label: "Burgundy", count: 487 },
        { id: "bordeaux", label: "Bordeaux", count: 621 },
        { id: "loire", label: "Loire Valley", count: 312 },
        { id: "rhone", label: "Rhône", count: 294 },
        { id: "champagne", label: "Champagne", count: 0 },
      ],
    },
    {
      id: "varietal",
      title: "Varietal",
      type: "checkbox",
      options: [
        { id: "pinot", label: "Pinot Noir", count: 412 },
        { id: "chardonnay", label: "Chardonnay", count: 287 },
        { id: "cabernet", label: "Cabernet Sauvignon", count: 318 },
        { id: "merlot", label: "Merlot", count: 240 },
        { id: "syrah", label: "Syrah", count: 188 },
        { id: "riesling", label: "Riesling", count: 0 },
      ],
    },
    {
      id: "vintage",
      title: "Vintage",
      type: "range",
      min: 1985, max: 2023,
      lo: 2015, hi: 2020,
      format: (n) => String(Math.round(n)),
      histogram: [4, 8, 12, 18, 24, 30, 38, 52, 68, 84, 96, 78, 62, 40, 22],
    },
    {
      id: "body",
      title: "Body",
      type: "checkbox",
      options: [
        { id: "light", label: "Light", count: 412 },
        { id: "medium", label: "Medium", count: 887 },
        { id: "full", label: "Full", count: 642 },
      ],
    },
  ],
  results: [
    { id: "w1", title: "Domaine de la Romanée-Conti", price: 24500, attrs: ["Pinot Noir", "Burgundy", "2018"], badge: "RARE", icon: "wine" },
    { id: "w2", title: "Château Margaux", price: 1280, attrs: ["Cabernet blend", "Bordeaux", "2015"], icon: "wine" },
    { id: "w3", title: "Sancerre · Pascal Cotat", price: 142, attrs: ["Sauv. Blanc", "Loire", "2020"], icon: "wine" },
    { id: "w4", title: "Côte-Rôtie · Guigal", price: 385, attrs: ["Syrah", "Rhône", "2016"], badge: "FEATURED", icon: "wine" },
    { id: "w5", title: "Meursault · Coche-Dury", price: 1840, attrs: ["Chardonnay", "Burgundy", "2017"], icon: "wine" },
    { id: "w6", title: "Pétrus", price: 4250, attrs: ["Merlot", "Pomerol", "2015"], badge: "RARE", icon: "wine" },
    { id: "w7", title: "Vouvray · Huet", price: 78, attrs: ["Chenin Blanc", "Loire", "2019"], icon: "wine" },
    { id: "w8", title: "Chambertin · Armand Rousseau", price: 2840, attrs: ["Pinot Noir", "Burgundy", "2016"], icon: "wine" },
  ],
};

// ---------- Books ----------
const books = {
  id: "books",
  name: "Books",
  domain: "personal library · ~8,400 titles",
  total: 8412,
  filters: [
    {
      id: "genre",
      title: "Genre",
      type: "checkbox",
      options: [
        { id: "fiction", label: "Fiction", count: 2842 },
        { id: "scifi", label: "Science Fiction", count: 1287 },
        { id: "nonfic", label: "Non-fiction", count: 1942 },
        { id: "biog", label: "Biography", count: 612 },
        { id: "poetry", label: "Poetry", count: 240 },
        { id: "drama", label: "Drama", count: 0 },
      ],
    },
    {
      id: "year",
      title: "Year published",
      type: "range",
      min: 1900, max: 2024,
      lo: 1990, hi: 2024,
      format: (n) => String(Math.round(n)),
      histogram: [8, 12, 18, 22, 28, 32, 40, 48, 58, 72, 88, 92, 78, 64, 42],
    },
    {
      id: "rating",
      title: "Rating",
      type: "range",
      min: 1, max: 5,
      lo: 3.5, hi: 5,
      format: (n) => n.toFixed(1) + "★",
      histogram: [2, 4, 8, 16, 28, 42, 58, 72, 84, 92],
    },
    {
      id: "lang",
      title: "Language",
      type: "checkbox",
      options: [
        { id: "en", label: "English", count: 6240 },
        { id: "es", label: "Spanish", count: 842 },
        { id: "fr", label: "French", count: 612 },
        { id: "de", label: "German", count: 412 },
        { id: "ja", label: "Japanese", count: 306 },
      ],
    },
  ],
  results: [
    { id: "b1", title: "Gravity's Rainbow", price: 18.95, attrs: ["Pynchon, T.", "Fiction", "1973"], badge: "★ 4.6", icon: "book" },
    { id: "b2", title: "Pattern Recognition", price: 14.50, attrs: ["Gibson, W.", "Sci-Fi", "2003"], icon: "book" },
    { id: "b3", title: "The Power Broker", price: 24.95, attrs: ["Caro, R.", "Biography", "1974"], badge: "★ 4.9", icon: "book" },
    { id: "b4", title: "Annihilation", price: 12.00, attrs: ["VanderMeer, J.", "Sci-Fi", "2014"], icon: "book" },
    { id: "b5", title: "The Name of the Rose", price: 16.95, attrs: ["Eco, U.", "Fiction", "1980"], icon: "book" },
    { id: "b6", title: "Sapiens", price: 19.00, attrs: ["Harari, Y.", "Non-fiction", "2014"], badge: "FEATURED", icon: "book" },
    { id: "b7", title: "Lincoln in the Bardo", price: 15.95, attrs: ["Saunders, G.", "Fiction", "2017"], icon: "book" },
    { id: "b8", title: "The Sympathizer", price: 14.95, attrs: ["Nguyen, V.T.", "Fiction", "2015"], icon: "book" },
  ],
};

window.FE_DATASETS = { realEstate, wine, books };
