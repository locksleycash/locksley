// Tokenized stocks on Robinhood Chain, read off the chain itself rather than
// typed by hand: every entry is an ERC-20 whose on-chain name carries the
// "• Robinhood Token" marker Robinhood uses for its official issues.
// All of them are 18 decimals and quote against USDG.
//
// Regenerate by re-running the Blockscout sweep; holder counts drift daily and
// are here for default sort order, not for display as live figures.

export interface Stock {
  symbol: string;
  name: string;
  address: `0x${string}`;
  holders: number;
}

export const STOCK_DECIMALS = 18;

/** Quote currency for every stock pool on this chain. */
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;

/** USDG is 6 decimals while every stock is 18. Mixing them up silently turns a
 *  half-million-dollar pool into a rounding error, so never assume 18 here. */
export const USDG_DECIMALS = 6;

export const STOCKS: Stock[] = [
  { symbol: "NVDA", name: "NVIDIA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", holders: 37708 },
  { symbol: "AAPL", name: "Apple", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", holders: 32766 },
  { symbol: "SPCX", name: "Space Exploration Technologies Corp", address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", holders: 30404 },
  { symbol: "TSLA", name: "Tesla", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", holders: 26560 },
  { symbol: "GOOGL", name: "Alphabet Class A", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", holders: 26459 },
  { symbol: "MSFT", name: "Microsoft", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", holders: 22143 },
  { symbol: "AMD", name: "AMD", address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", holders: 21939 },
  { symbol: "PLTR", name: "Palantir Technologies", address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", holders: 21396 },
  { symbol: "AMZN", name: "Amazon", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", holders: 20282 },
  { symbol: "META", name: "Meta Platforms", address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", holders: 17878 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", holders: 16858 },
  { symbol: "INTC", name: "Intel", address: "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681", holders: 16275 },
  { symbol: "COIN", name: "Coinbase", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", holders: 15855 },
  { symbol: "MU", name: "Micron Technology", address: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD", holders: 15683 },
  { symbol: "ORCL", name: "Oracle", address: "0xb0992820E760d836549ba69BC7598b4af75dEE03", holders: 13947 },
  { symbol: "CRWV", name: "CoreWeave", address: "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3", holders: 13885 },
  { symbol: "USAR", name: "USA Rare Earth", address: "0xd917B029C761D264c6A312BBbcDA868658eF86a6", holders: 13308 },
  { symbol: "SNDK", name: "Sandisk Corporation", address: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400", holders: 13069 },
  { symbol: "GME", name: "GameStop", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", holders: 12413 },
  { symbol: "BE", name: "Bloom Energy", address: "0x822CC93fFD030293E9842c30BBD678F530701867", holders: 12055 },
  { symbol: "COST", name: "Costco", address: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2", holders: 5006 },
  { symbol: "USAR", name: "USA Rare Earth", address: "0x38D6254bcEa24cdcD327d99a0D4e50B8403B2Ea1", holders: 4877 },
  { symbol: "NFLX", name: "Netflix", address: "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8", holders: 4493 },
  { symbol: "QQQ", name: "Invesco QQQ", address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", holders: 3541 },
  { symbol: "RDDT", name: "Reddit", address: "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C", holders: 2631 },
  { symbol: "AMAT", name: "Applied Materials", address: "0x36046893810a7E7fCE501229d57dc3FC8c8716d0", holders: 2368 },
  { symbol: "SLV", name: "iShares Silver Trust", address: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f", holders: 2080 },
  { symbol: "TSM", name: "Taiwan Semiconductor Manufacturing", address: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA", holders: 1988 },
  { symbol: "MRVL", name: "Marvell Technology", address: "0x62fd0668e10D8B72339BE2DCF7643001688ff13B", holders: 1660 },
  { symbol: "LLY", name: "Eli Lilly", address: "0x8005d266423c7ea827372c9c864491e5786600ea", holders: 1647 },
  { symbol: "DELL", name: "Dell", address: "0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd", holders: 1635 },
  { symbol: "XOM", name: "ExxonMobil Holdings Corporation", address: "0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5", holders: 1609 },
  { symbol: "AVGO", name: "Broadcom", address: "0x156E175DD063a8cE274C50654eF40e0032b3fbcF", holders: 1565 },
  { symbol: "USO", name: "United States Oil Fund", address: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344", holders: 1544 },
  { symbol: "QCOM", name: "Qualcomm", address: "0x0f17206447090e464C277571124dD2688E48AEA9", holders: 1532 },
  { symbol: "CRCL", name: "Circle Internet Group", address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", holders: 742 },
  { symbol: "MSTR", name: "Strategy Inc.", address: "0xec262a75e413fAfD0dF80480274532C79D42da09", holders: 558 },
  { symbol: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF", address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", holders: 263 },
  { symbol: "BABA", name: "Alibaba", address: "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4", holders: 183 },
  { symbol: "RBLX", name: "Roblox", address: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8", holders: 139 },
  { symbol: "ASML", name: "ASML Holding NV", address: "0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA", holders: 121 },
  { symbol: "TTWO", name: "Take-Two Interactive Software", address: "0x5e81213613b6B86EaB4c6c50d718d34359459786", holders: 67 },
  { symbol: "QUBT", name: "Quantum Computing", address: "0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4", holders: 59 },
  { symbol: "PENG", name: "Penguin Solutions", address: "0x9b23573b156B52565012F5cE02CDF60AFBaa70Be", holders: 56 },
  { symbol: "RKLB", name: "Rocket Lab Corporation", address: "0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2", holders: 55 },
  { symbol: "ASTS", name: "AST SpaceMobile", address: "0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137", holders: 52 },
  { symbol: "AAOI", name: "Applied Optoelectronics", address: "0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E", holders: 51 },
  { symbol: "NBIS", name: "Nebius Group", address: "0x9D9c6684F596F66a64C030B93A886D51Fd4D7931", holders: 50 },
  { symbol: "IONQ", name: "IonQ", address: "0x558378E000D634A36593E338eBacdd6207640EfE", holders: 46 },
  { symbol: "NU", name: "Nu", address: "0x408c14038a04f7bD235329E26d2bf569ee20e250", holders: 44 },
  { symbol: "SMCI", name: "Super Micro Computer", address: "0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a", holders: 42 },
  { symbol: "EWY", name: "iShares MSCI South Korea fund", address: "0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc", holders: 40 },
  { symbol: "SOFI", name: "SoFi Technologies", address: "0x98E75885157C80992A8D41b696D8c9C6Fb30A926", holders: 40 },
  { symbol: "RGTI", name: "Rigetti Computing", address: "0x284358abc07F9359f19f4b5b4aC91901Be2597Ba", holders: 39 },
  { symbol: "APLD", name: "Applied Digital", address: "0xb8DBf92F9741c9ac1c32115E78581f23509916FD", holders: 39 },
  { symbol: "NNE", name: "Nano Nuclear Energy", address: "0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926", holders: 37 },
  { symbol: "IREN", name: "IREN Limited", address: "0xF0AB0c93bE6F41369d302e55db1A96b3c430212D", holders: 37 },
  { symbol: "POET", name: "POET Technologies", address: "0xcf6B2D875361be807EAfa57458c80f28521F9333", holders: 35 },
  { symbol: "UPS", name: "UPS", address: "0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2", holders: 35 },
  { symbol: "RDW", name: "Redwire", address: "0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE", holders: 35 },
  { symbol: "SPMO", name: "Invesco S&P 500 Momentum ETF", address: "0xAd622320e520de39e72d41EF07438C3Fd3354875", holders: 34 },
  { symbol: "LITE", name: "Lumentum", address: "0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C", holders: 34 },
  { symbol: "DDOG", name: "Datadog", address: "0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958", holders: 33 },
  { symbol: "F", name: "Ford Motor", address: "0x25C288E6D899b9BC30160965aD9644c67e73bE0C", holders: 32 },
  { symbol: "QBTS", name: "D-Wave Quantum", address: "0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc", holders: 31 },
  { symbol: "SOXX", name: "iShares Semiconductor ETF", address: "0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38", holders: 31 },
  { symbol: "LULU", name: "Lululemon", address: "0x4e62068525Ab11FE768e29dfD00ef909B9803016", holders: 31 },
  { symbol: "XLK", name: "State Street Technology Select Sector SPDR ETF", address: "0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43", holders: 30 },
  { symbol: "MXL", name: "MaxLinear", address: "0x48961813349333209994750ffA89b3c5C22eC969", holders: 29 },
  { symbol: "CLSK", name: "CleanSpark", address: "0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3", holders: 27 },
  { symbol: "XNDU", name: "Xanadu Quantum", address: "0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289", holders: 27 },
  { symbol: "SHOP", name: "Shopify", address: "0xF53F66751B1Eff985311b693531E3290F600c410", holders: 27 },
  { symbol: "CCL", name: "Carnival Corporation", address: "0x9651342CeA770aE9a2969Ba2A52611523146aef9", holders: 26 },
  { symbol: "LUNR", name: "Intuitive Machines", address: "0xa5D4968421bA94814Be3B136b15cf422101aC1a3", holders: 26 },
  { symbol: "BA", name: "Boeing", address: "0x4D21483a44Bf67a86b77E3dA301411880797D452", holders: 25 },
  { symbol: "CELH", name: "Celsius", address: "0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF", holders: 25 },
  { symbol: "GLW", name: "Corning", address: "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6", holders: 25 },
  { symbol: "WDAY", name: "Workday", address: "0x82DA4646242e1D962e96e932269Dc644c94a9CaA", holders: 24 },
  { symbol: "FLNC", name: "Fluence Energy", address: "0x282e87451E10fA6679BC7D76C69BE44cD3fC777C", holders: 22 },
  { symbol: "MDB", name: "MongoDB", address: "0xDdf2266b79abf0B48898959B0ed6E6adf512be74", holders: 21 },
  { symbol: "NVTS", name: "Navitas Semiconductor", address: "0xbE6702d7b70315376dC48a3293f24f0982F86386", holders: 21 },
  { symbol: "ELF", name: "e.l.f. Beauty", address: "0x39EC44Bee4F6A116c6F9B8De566848a985C53C60", holders: 20 },
  { symbol: "UMC", name: "United Microelectronics", address: "0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79", holders: 20 },
  { symbol: "ZS", name: "Zscaler", address: "0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7", holders: 20 },
  { symbol: "FUTU", name: "Futu Holdings", address: "0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D", holders: 19 },
  { symbol: "PR", name: "Permian Resources", address: "0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C", holders: 19 },
  { symbol: "ZM", name: "Zoom", address: "0x44c4F142009036cF477eD2d09932051843137CF1", holders: 19 },
  { symbol: "P", name: "Everpure", address: "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D", holders: 17 },
  { symbol: "CRWD", name: "CrowdStrike Holdings", address: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931", holders: 5 },
  { symbol: "SATS", name: "EchoStar", address: "0x95052ddcd5DC25641657424A8Cf04834997E1730", holders: 4 },
];

export const bySymbol = new Map(STOCKS.map((s) => [s.symbol, s]));

export const findStock = (q: string): Stock | undefined => {
  const t = q.trim().toLowerCase();
  return (
    bySymbol.get(q.trim().toUpperCase()) ??
    STOCKS.find((s) => s.name.toLowerCase() === t) ??
    STOCKS.find((s) => s.name.toLowerCase().includes(t))
  );
};
