const fs = require('fs');

class HashOnlyBTCDB {
    constructor() {
        this.hashes = null;
        this.hashCount = 0;
    }

    // Load hash-only binary database
    loadDatabase(filename) {
        try {
            console.log(`Loading database: ${filename}`);
            const buffer = fs.readFileSync(filename);
            
            // Verify header (24 bytes)
            if (buffer.length < 24) {
                console.error('File too small to be a valid database');
                return false;
            }
            
            // Verify magic "BTCHASH1"
            const magic = buffer.toString('ascii', 0, 8);
            if (magic !== 'BTCHASH1') {
                console.error(`Invalid magic: ${magic}, expected: BTCHASH1`);
                return false;
            }
            
            // Read hash count (8 bytes, little endian)
            this.hashCount = buffer.readBigUInt64LE(8);
            console.log(`Hash count: ${this.hashCount}`);
            
            // Read hash size (should be 8)
            const hashSize = buffer.readBigUInt64LE(16);
            if (hashSize !== 8n) {
                console.error(`Invalid hash size: ${hashSize}, expected: 8`);
                return false;
            }
            
            // Read all hashes (starting from byte 24)
            const hashDataStart = 24;
            const expectedDataSize = Number(this.hashCount) * 8;
            const actualDataSize = buffer.length - hashDataStart;
            
            if (actualDataSize < expectedDataSize) {
                console.error(`Insufficient data: ${actualDataSize} < ${expectedDataSize}`);
                return false;
            }
            
            // Convert hashes to JavaScript array
            this.hashes = [];
            for (let i = 0; i < Number(this.hashCount); i++) {
                const offset = hashDataStart + (i * 8);
                const hash = buffer.readBigUInt64LE(offset);
                this.hashes.push(hash);
            }
            
            console.log(`Database loaded: ${this.hashes.length} hashes`);
            console.log(`First hash: 0x${this.hashes[0].toString(16)}`);
            console.log(`Last hash: 0x${this.hashes[this.hashes.length - 1].toString(16)}`);
            
            // Verify that hashes are sorted
            if (!this.verifyOrdering()) {
                console.warn('WARNING: Hashes not properly sorted!');
            }
            
            return true;
            
        } catch (error) {
            console.error(`Database loading error: ${error.message}`);
            return false;
        }
    }
    
    // Verify that hashes are sorted (for binary search)
    verifyOrdering() {
        for (let i = 1; i < Math.min(1000, this.hashes.length); i++) {
            if (this.hashes[i] <= this.hashes[i - 1]) {
                return false;
            }
        }
        return true;
    }
    
    // Simplified xxHash64 (compatible with Python)
    xxhash64(str) {
        let h = 0x9e3779b185ebca87n;
        
        for (let i = 0; i < str.length; i++) {
            const byte = BigInt(str.charCodeAt(i));
            h ^= byte;
            h = ((h << 13n) | (h >> 51n)) & 0xFFFFFFFFFFFFFFFFn;
            h = (h * 0xc2b2ae3d27d4eb4fn) & 0xFFFFFFFFFFFFFFFFn;
        }
        
        return h;
    }
    
    // Binary search to find a hash
    binarySearch(targetHash) {
        let left = 0;
        let right = this.hashes.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midHash = this.hashes[mid];
            
            if (midHash === targetHash) {
                return true; // Found!
            } else if (midHash < targetHash) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        return false; // Not found
    }
    
    // Check if a Bitcoin address has balance (ultra-fast lookup)
    hasAddress(address) {
        if (!this.hashes || this.hashes.length === 0) {
            return false;
        }
        
        const targetHash = this.xxhash64(address);
        return this.binarySearch(targetHash);
    }
    
    // Database statistics
    getStats() {
        return {
            hashCount: this.hashCount,
            fileSizeMB: this.hashes ? (Number(this.hashCount) * 8 + 24) / 1024 / 1024 : 0,
            isLoaded: this.hashes !== null,
            sampleHashes: this.hashes ? this.hashes.slice(0, 5).map(h => `0x${h.toString(16)}`) : []
        };
    }
}

// Database test
async function testDatabase() {
    console.log('=== Hash Database Test ===');
    
    const db = new HashOnlyBTCDB();
    
    // Load database
    if (!db.loadDatabase('bitcoin_addresses_hash_only.db')) {
        console.error('Unable to load database!');
        return;
    }
    
    // Statistics
    console.log('\n=== Statistics ===');
    console.log(db.getStats());
    
    // Test with known addresses
    console.log('\n=== Lookup Test ===');
    
    // Test with some addresses (replace with real addresses from your TSV)
    const testAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis block
        '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs', // Bitcoin.com example
        '1234567890ABCDEF' // Fake address for negative test
    ];
    
    for (const addr of testAddresses) {
        const hasBalance = db.hasAddress(addr);
        const hash = db.xxhash64(addr);
        console.log(`Address: ${addr}`);
        console.log(`Hash: 0x${hash.toString(16)}`);
        console.log(`Has balance: ${hasBalance}\n`);
    }
    
    // Performance test
    console.log('=== Performance Test ===');
    const startTime = Date.now();
    let testCount = 100000;
    
    for (let i = 0; i < testCount; i++) {
        const fakeAddress = `1Test${i}Address`;
        db.hasAddress(fakeAddress);
    }
    
    const endTime = Date.now();
    const timeMs = endTime - startTime;
    const lookupsPerSec = Math.floor(testCount / (timeMs / 1000));
    
    console.log(`${testCount} lookups in ${timeMs}ms`);
    console.log(`Performance: ${lookupsPerSec} lookups/sec`);
}

// Export for use in other modules
module.exports = HashOnlyBTCDB;

// If run directly, run test
if (require.main === module) {
    testDatabase();
}