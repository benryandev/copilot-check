// Third-party projects on Builders' Row, added by hand after Ben approves a submission from
// /ecosystem/submit/ (vetting checklist: docs/ECOSYSTEM-PLAN.md in the Strike repo). Each entry:
//   key      short unique id, lower case (also the logo's file name)
//   name     as the project writes it (the shop sign), at most 40 characters
//   summary  one or two sentences in our words, checked against the live product
//   points   up to three short facts (how it uses Strike, who runs it)
//   site     its https home page; github / x optional (x is a handle without @)
//   logo     optional: true when img/projects/<key>.png exists (square, 256 px, fetched and checked by hand)
// No APR, yield or "recommended" claims, same as every other sheet.
export const PROJECTS = [
  {
    key: "tamtam",
    name: "Strike tam-tam",
    summary: "Send a short message to any Strike trader as a Cardano NFT. Find them by Strike nickname, ADA Handle or wallet address, write up to 256 characters and your wallet mints it straight into theirs.",
    points: [
      "Looks traders up through Strike's public API; the message itself is minted on Cardano, wallet to wallet, with no server holding it.",
      "Messages can be encrypted on-chain. The Strike version costs about the network fee and minimum ADA, around 1.6 ADA a message.",
      "By Mato, the maker of matotam.io. Submitted 31 Oct 2026 and checked against the live app.",
    ],
    site: "https://strike.matotam.io/",
    x: "matotam_ada",
    logo: true,
  },
];
