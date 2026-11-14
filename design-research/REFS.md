# Cart design references

Captured 2026-11-14 with refshot.py in the deepsurge profile at 1440x900. Task: paste an Amazon link, see a live quote, pick the asset to pay with, watch the order settle.

## SP3ND (sp3nd.shop), home
Screenshot: refs/sp3nd.png, tokens: refs/sp3nd.tokens.json.
Direct competitor: the same SP3ND checkout Cart settles through. Measured: page background rgb(0,0,0); h1 68px Inter Tight weight 550, rgb(250,250,250); body 15px Inter Tight; the paste field is a 17px input inside a pill with a white 48px circular arrow button; secondary chips are 14px weight 500 on rgba(255,255,255,0.06) with radius 99px; Geist Mono for numerals.
Steal: one giant paste bar as the only first action; the arrow-in-a-circle submit. Do not take: the all-black void, the animated "Amazon" word swap, the 1px-bordered empty rounded stage, the hidden fee model behind a "Fees & shipping" chip.

## Channel3 (trychannel3.com), home
Screenshot: refs/trychannel3.png, tokens: refs/trychannel3.tokens.json.
Category reference for product-graph shopping. Measured: white page, black text; h1 60px Stack Sans Headline weight 500 with tight tracking; body 16px; search input 14px with 36px left padding for the icon, 1px hairline border, radius 0; three feature panels in flat navy, sky and violet with 10px uppercase tracked labels.
Steal: hairline 1px boxes with zero radius, tiny tracked uppercase labels, heavy tight headline. Do not take: the blue and violet tinted panels, the agent-developer pitch.

## Buyhatke (buyhatke.com), home
Screenshot: refs/buyhatke.png, tokens: refs/buyhatke.tokens.json.
Price-history and deal reference. Measured: body 16px Metropolis on white; buttons 12px indigo rgb(88,85,229) on white with radius 8px and 16px padding; the compare card lists stores as rows, the best row outlined with an indigo border and a "BEST DEAL" tab, the saving shown as a green pill ("You save").
Steal: one row outlined as the winner; a single green pill that states the consequence in money. Do not take: the indigo brand, the laurel badges, the Chrome-extension hero.

## Direction taken
Cart answers what all three leave open: what does this cost me in the coin I hold, and where is my order right now. The page is a receipt that settles itself: a heavy tight Bricolage Grotesque headline on sage canvas (#e8ebe6, the repo DESIGN.md tokens), a 1px hairline paste bar with a lime circle arrow, and a sticky thermal-paper receipt with zigzag edges that prints the quote, tax and total in DM Mono, then the route NEAR Intents, Solana USDC, Amazon order, then stamps each settlement step with a time. One ink-black route card and one lime action per screen; semantic green, amber and red only for status.
