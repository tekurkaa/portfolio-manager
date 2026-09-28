"""
Asset Metadata Service.
Provides upstream metadata classification for portfolio holdings:
- asset_type: 'crypto' | 'etf' | 'stock'
- is_broad_market: bool (True for broad index funds, False otherwise)
- sub_type: 'broad_index' | 'leveraged_thematic' | 'blue_chip' | 'speculative' | None
"""

from typing import Dict, Any, Optional

# Broad-market, diversified core index ETFs
BROAD_INDEX_ETFS = {
    "VOO", "QQQ", "SPY", "IVV", "VTI", "IWM", "DIA", "VEA", "VWO", "SCHD",
    "VT", "BND", "AGG", "SPLG", "RSP", "ITOT", "VXUS", "VIG", "IJR", "IJH"
}

# Thematic, leveraged, sector, or commodity ETFs
THEMATIC_LEVERAGED_ETFS = {
    "GLD", "SOXL", "TQQQ", "UPRO", "ARKK", "SLV", "USO", "XLE", "XLF", "XLK",
    "XLU", "XLI", "XLV", "XLP", "XLY", "XLC", "XLRE", "XLB", "SMH", "IBIT",
    "ETHA", "LABU", "TNA", "SQQQ", "SOXS", "SPXU", "UVXY", "GDX", "UNG", "KWEB"
}

KNOWN_CRYPTO = {
    "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "MATIC", "AVAX", "DOT",
    "LINK", "LTC", "BCH", "ATOM", "SHIB", "UNI", "BNB", "NEAR", "APT", "TRX"
}


def resolve_asset_metadata(
    symbol: str,
    description: str = "",
    declared_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Infers asset metadata based on symbol, name/description, and declared asset type.
    Guarantees 'asset_type', 'is_broad_market', and 'sub_type'.
    """
    sym = (symbol or "").upper().replace("-USD", "").strip()
    desc = (description or "").upper()
    decl = (declared_type or "").lower().strip()

    # 1. Crypto Check
    if decl == "crypto" or "-USD" in (symbol or "").upper() or sym in KNOWN_CRYPTO or "CRYPTO" in desc:
        is_blue = sym in ("BTC", "ETH")
        return {
            "asset_type": "crypto",
            "is_broad_market": False,
            "sub_type": "blue_chip" if is_blue else "speculative",
        }

    # 2. Broad Index ETF Check
    if sym in BROAD_INDEX_ETFS or (decl == "etf" and any(k in desc for k in ["S&P 500", "TOTAL STOCK", "NASDAQ 100", "BROAD MARKET", "INDEX ETF"])):
        return {
            "asset_type": "etf",
            "is_broad_market": True,
            "sub_type": "broad_index",
        }

    # 3. Thematic / Leveraged / Sector ETF Check
    if sym in THEMATIC_LEVERAGED_ETFS or decl == "etf" or any(k in desc for k in ["ETF", "TRUST", "LEVERAGED", "BULL 3X", "BEAR 3X", "INDEX FUND", "COMMODITY"]):
        return {
            "asset_type": "etf",
            "is_broad_market": False,
            "sub_type": "leveraged_thematic",
        }

    # 4. Standard Equity Fallback
    return {
        "asset_type": "stock",
        "is_broad_market": False,
        "sub_type": None,
    }


MASTER_SECURITY_METADATA: Dict[str, Dict[str, Any]] = {
    # High-Growth & Tech Equities
    "DDOG": {
        "name": "Datadog, Inc.",
        "sector": "Technology",
        "industry": "Software - Application",
        "quote_type": "EQUITY",
        "summary": "Datadog, Inc. operates an observability and cloud security platform for cloud-scale applications. Its integrated platform automates infrastructure monitoring, application performance monitoring (APM), log management, real user monitoring, and cloud cost management for modern engineering teams.",
    },
    "PLTR": {
        "name": "Palantir Technologies Inc.",
        "sector": "Technology",
        "industry": "Software - Infrastructure",
        "quote_type": "EQUITY",
        "summary": "Palantir Technologies Inc. builds foundational software platforms that enable defense, intelligence, and commercial enterprises to integrate, analyze, and operationalize massive datasets using artificial intelligence.",
    },
    "NVDA": {
        "name": "NVIDIA Corporation",
        "sector": "Technology",
        "industry": "Semiconductors",
        "quote_type": "EQUITY",
        "summary": "NVIDIA Corporation pioneers GPU accelerated computing, delivering premier AI infrastructure, tensor-core accelerated computing clusters, CUDA software ecosystem, and enterprise omniverse platforms worldwide.",
    },
    "AAPL": {
        "name": "Apple Inc.",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "quote_type": "EQUITY",
        "summary": "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories, supported by an expansive digital services ecosystem including Apple Pay, iCloud, and the App Store.",
    },
    "MSFT": {
        "name": "Microsoft Corporation",
        "sector": "Technology",
        "industry": "Software - Infrastructure",
        "quote_type": "EQUITY",
        "summary": "Microsoft Corporation develops and supports a wide range of software products, cloud services (Microsoft Azure), devices, and enterprise solutions, driving global productivity and AI integration across commercial and personal computing.",
    },
    "TSLA": {
        "name": "Tesla, Inc.",
        "sector": "Consumer Cyclical",
        "industry": "Auto Manufacturers",
        "quote_type": "EQUITY",
        "summary": "Tesla, Inc. designs, develops, manufactures, sells, and leases fully electric vehicles, energy generation and storage systems, and artificial intelligence robotics and autonomous driving software.",
    },
    "AMZN": {
        "name": "Amazon.com, Inc.",
        "sector": "Consumer Cyclical",
        "industry": "Internet Retail",
        "quote_type": "EQUITY",
        "summary": "Amazon.com, Inc. focuses on retail sale of consumer products and subscriptions through online and physical stores, cloud infrastructure services through Amazon Web Services (AWS), advertising, and digital streaming.",
    },
    "GOOGL": {
        "name": "Alphabet Inc. (Class A)",
        "sector": "Communication Services",
        "industry": "Internet Content & Information",
        "quote_type": "EQUITY",
        "summary": "Alphabet Inc. is the parent company of Google, YouTube, Android, and Google Cloud, providing global digital advertising, web search, cloud computing solutions, and cutting-edge artificial intelligence research.",
    },
    "GOOG": {
        "name": "Alphabet Inc. (Class C)",
        "sector": "Communication Services",
        "industry": "Internet Content & Information",
        "quote_type": "EQUITY",
        "summary": "Alphabet Inc. is the parent company of Google, YouTube, Android, and Google Cloud, providing global digital advertising, web search, cloud computing solutions, and cutting-edge artificial intelligence research.",
    },
    "META": {
        "name": "Meta Platforms, Inc.",
        "sector": "Communication Services",
        "industry": "Internet Content & Information",
        "quote_type": "EQUITY",
        "summary": "Meta Platforms, Inc. builds technologies that help people connect, find communities, and grow businesses across Facebook, Instagram, Messenger, WhatsApp, and advanced spatial computing hardware.",
    },
    "SNOW": {
        "name": "Snowflake Inc.",
        "sector": "Technology",
        "industry": "Software - Application",
        "quote_type": "EQUITY",
        "summary": "Snowflake Inc. provides a cloud-based data platform that enables organizations to consolidate data into a single source of truth, power analytics, build data applications, and share secure data sets.",
    },
    "AMD": {
        "name": "Advanced Micro Devices, Inc.",
        "sector": "Technology",
        "industry": "Semiconductors",
        "quote_type": "EQUITY",
        "summary": "Advanced Micro Devices, Inc. designs and manufactures high-performance microprocessors, graphics processing units (GPUs), data center accelerators, and FPGA adaptive computing solutions.",
    },
    "COIN": {
        "name": "Coinbase Global, Inc.",
        "sector": "Financial Services",
        "industry": "Capital Markets",
        "quote_type": "EQUITY",
        "summary": "Coinbase Global, Inc. operates a premier cryptocurrency exchange platform providing financial infrastructure and technology for the crypto economy, institutional custody, and retail digital asset trading.",
    },
    "MDB": {
        "name": "MongoDB, Inc.",
        "sector": "Technology",
        "industry": "Software - Infrastructure",
        "quote_type": "EQUITY",
        "summary": "MongoDB, Inc. provides a leading general-purpose modern document database platform, powering cloud-native transactional, search, and AI-vector applications globally through MongoDB Atlas.",
    },
    "CRWD": {
        "name": "CrowdStrike Holdings, Inc.",
        "sector": "Technology",
        "industry": "Software - Infrastructure",
        "quote_type": "EQUITY",
        "summary": "CrowdStrike Holdings, Inc. delivers cloud-delivered protection of endpoints, cloud workloads, identity, and data via the Falcon AI-native cybersecurity architecture.",
    },
    "NET": {
        "name": "Cloudflare, Inc.",
        "sector": "Technology",
        "industry": "Software - Infrastructure",
        "quote_type": "EQUITY",
        "summary": "Cloudflare, Inc. operates a global cloud services network providing website security, content delivery network (CDN) performance optimization, edge serverless compute (Workers), and cybersecurity protection.",
    },
    "ARM": {
        "name": "Arm Holdings plc",
        "sector": "Technology",
        "industry": "Semiconductors",
        "quote_type": "EQUITY",
        "summary": "Arm Holdings plc architects, develops, and licenses high-performance, low-cost, and energy-efficient CPU products and related technology deployed in billions of smartphones, cloud servers, and IoT devices.",
    },
    "SMCI": {
        "name": "Super Micro Computer, Inc.",
        "sector": "Technology",
        "industry": "Computer Hardware",
        "quote_type": "EQUITY",
        "summary": "Super Micro Computer, Inc. develops and manufactures high-performance server and storage solutions based on modular, open-standard architecture tailored for enterprise cloud, 5G, and AI data centers.",
    },
    "RVI": {
        "name": "Retail Value Inc.",
        "sector": "Real Estate",
        "industry": "REIT - Retail",
        "quote_type": "EQUITY",
        "summary": "Retail Value Inc. was formed to manage and maximize retail shopping center real estate properties in the continental United States and Puerto Rico.",
    },

    # Major ETFs
    "QQQ": {
        "name": "Invesco QQQ Trust",
        "sector": "Index Fund / ETF",
        "industry": "Large-Cap Growth & Tech",
        "quote_type": "ETF",
        "summary": "Invesco QQQ Trust is an exchange-traded fund that tracks the benchmark NASDAQ-100 Index, providing concentrated exposure to 100 of the world's largest non-financial innovative technology and growth enterprises.",
    },
    "SPY": {
        "name": "SPDR S&P 500 ETF Trust",
        "sector": "Index Fund / ETF",
        "industry": "Large-Cap Blend Equity",
        "quote_type": "ETF",
        "summary": "SPDR S&P 500 ETF Trust is the world's first and largest exchange-traded fund, tracking the performance of the S&P 500 Index representing the core foundation of the US public equity market.",
    },
    "VOO": {
        "name": "Vanguard S&P 500 ETF",
        "sector": "Index Fund / ETF",
        "industry": "Large-Cap Blend Equity",
        "quote_type": "ETF",
        "summary": "Vanguard S&P 500 ETF invests in stocks in the S&P 500 Index, representing 500 of the largest US companies with ultra-low expense fees for long-term core capital appreciation.",
    },
    "SOXL": {
        "name": "Direxion Daily Semiconductor Bull 3X Shares",
        "sector": "Leveraged Thematic ETF",
        "industry": "Semiconductor Leveraged Equity",
        "quote_type": "ETF",
        "summary": "Direxion Daily Semiconductor Bull 3X Shares seeks daily investment results, before fees and expenses, of 300% of the performance of the NYSE Semiconductor Index.",
    },
    "SOXS": {
        "name": "Direxion Daily Semiconductor Bear 3X Shares",
        "sector": "Leveraged Inverse ETF",
        "industry": "Semiconductor Inverse Equity",
        "quote_type": "ETF",
        "summary": "Direxion Daily Semiconductor Bear 3X Shares seeks daily investment results, before fees and expenses, of 300% of the inverse (-300%) of the NYSE Semiconductor Index.",
    },
    "TQQQ": {
        "name": "ProShares UltraPro QQQ",
        "sector": "Leveraged Thematic ETF",
        "industry": "NASDAQ-100 3X Leveraged",
        "quote_type": "ETF",
        "summary": "ProShares UltraPro QQQ seeks daily investment results, before fees and expenses, that correspond to three times (3x) the daily performance of the NASDAQ-100 Index.",
    },
    "SQQQ": {
        "name": "ProShares UltraPro Short QQQ",
        "sector": "Leveraged Inverse ETF",
        "industry": "NASDAQ-100 -3X Inverse",
        "quote_type": "ETF",
        "summary": "ProShares UltraPro Short QQQ seeks daily investment results, before fees and expenses, that correspond to three times the inverse (-3x) of the daily performance of the NASDAQ-100 Index.",
    },
    "SMH": {
        "name": "VanEck Semiconductor ETF",
        "sector": "Thematic ETF",
        "industry": "Semiconductors",
        "quote_type": "ETF",
        "summary": "VanEck Semiconductor ETF seeks to replicate as closely as possible the price and yield performance of the MVIS US Listed Semiconductor 25 Index, tracking top global chipmakers and semiconductor equipment leaders.",
    },
    "ARKK": {
        "name": "ARK Innovation ETF",
        "sector": "Thematic ETF",
        "industry": "Disruptive Innovation",
        "quote_type": "ETF",
        "summary": "ARK Innovation ETF is an actively managed exchange-traded fund that seeks long-term growth of capital by investing in companies that rely on or benefit from the development of disruptive innovation.",
    },
    "GLD": {
        "name": "SPDR Gold Shares",
        "sector": "Commodity ETF",
        "industry": "Physical Gold Bullion",
        "quote_type": "ETF",
        "summary": "SPDR Gold Shares is the largest physically backed gold exchange-traded fund in the world, offering investors an innovative, cost-effective way to access the gold market without physical delivery logistics.",
    },
    "IBIT": {
        "name": "iShares Bitcoin Trust ETF",
        "sector": "Digital Asset ETF",
        "industry": "Spot Bitcoin",
        "quote_type": "ETF",
        "summary": "iShares Bitcoin Trust ETF seeks to reflect the performance of the price of Bitcoin, held in institutional cold storage custody by Coinbase on behalf of BlackRock.",
    },

    # Cryptocurrencies
    "BTC": {
        "name": "Bitcoin",
        "sector": "Cryptocurrency",
        "industry": "Digital Currency & Store of Value",
        "quote_type": "crypto",
        "summary": "Bitcoin is the premier decentralized cryptocurrency, launched in 2009 by the pseudonymous creator Satoshi Nakamoto. Operating on a global proof-of-work blockchain network with a mathematically enforced 21 million coin cap, it functions as sovereign digital gold and a trustless global settlement ledger.",
    },
    "ETH": {
        "name": "Ethereum",
        "sector": "Cryptocurrency",
        "industry": "Smart Contract Blockchain Platform",
        "quote_type": "crypto",
        "summary": "Ethereum is an open-source, globally decentralized computing platform powered by the Ether token. It introduced programmable smart contracts, serving as the foundational settlement layer for decentralized finance (DeFi), web3 applications, and layer-2 scaling rollups.",
    },
    "SOL": {
        "name": "Solana",
        "sector": "Cryptocurrency",
        "industry": "High-Throughput Layer-1 Blockchain",
        "quote_type": "crypto",
        "summary": "Solana is a high-performance decentralized blockchain designed for widespread mainstream adoption. Combining Proof of History (PoH) with Proof of Stake, it processes thousands of transactions per second with sub-second finality and near-zero transaction fees.",
    },
    "DOGE": {
        "name": "Dogecoin",
        "sector": "Cryptocurrency",
        "industry": "Peer-to-Peer Digital Currency",
        "quote_type": "crypto",
        "summary": "Dogecoin is an open-source peer-to-peer cryptocurrency created in 2013 by Billy Markus and Jackson Palmer. Utilizing a Scrypt-based proof-of-work algorithm, Dogecoin features fast transaction confirmations and an active global community.",
    },
    "AVAX": {
        "name": "Avalanche",
        "sector": "Cryptocurrency",
        "industry": "Smart Contract Subnet Platform",
        "quote_type": "crypto",
        "summary": "Avalanche is a smart contracts platform built for high throughput and rapid sub-second finality. Its novel multi-chain subnet architecture allows enterprises and developers to deploy custom interoperable blockchain networks.",
    },
    "LINK": {
        "name": "Chainlink",
        "sector": "Cryptocurrency",
        "industry": "Decentralized Oracle Network",
        "quote_type": "crypto",
        "summary": "Chainlink is the industry-standard Web3 services platform connecting blockchains to real-world off-chain data feeds, payment rails, reserve proofs, and cross-chain interoperability protocols (CCIP).",
    },
}


def get_security_master_profile(symbol: str) -> Optional[Dict[str, Any]]:
    clean = (symbol or "").upper().replace("-USD", "").strip()
    return MASTER_SECURITY_METADATA.get(clean)
