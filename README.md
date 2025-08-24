# BTC Brute Force Recovery

A high-performance Bitcoin seed phrase brute force recovery system that uses combinatorial search to find valid BIP39 seed phrases with associated Bitcoin balances.

## What It Does

This tool systematically generates and tests 12-word BIP39 seed phrase combinations from a shuffled wordlist, checking if the generated Bitcoin addresses contain funds. It uses proper Bitcoin cryptography (BIP39/BIP32/BIP44) to generate legitimate addresses and performs ultra-fast lookups against a database of funded Bitcoin addresses.

## Key Features

### **Ultra-Fast Database Lookups**
- **Binary hash database**: Contains xxHash64 hashes of 39+ million Bitcoin addresses with balance > 0
- **Binary search algorithm**: Achieves ~130,000+ lookups per second with O(log n) complexity
- **300MB optimized format**: Memory-mapped for maximum performance

### **Smart Combinatorial Generation**
- **No repetitions**: Generates mathematical combinations (not permutations) from wordlist
- **BIP39 validation**: Only tests cryptographically valid seed phrases with correct checksums
- **Optimized algorithms**: Custom combination generation with minimal memory allocation

### **Checkpoint System**
- **Automatic saves**: Progress saved every 60 seconds to `recovery_checkpoint.json`
- **Resume capability**: Automatically resumes from last checkpoint on restart
- **Graceful interruption**: CTRL+C saves final checkpoint before exit
- **Session tracking**: Separate counters for total vs session progress

### **Real-time Progress Display**
- **Live dashboard**: Updates every second with current statistics
- **Performance metrics**: Shows combinations/second, elapsed time, session speed
- **Current combination**: Displays the indices currently being tested
- **Found seeds**: Counter of discovered seed phrases with balances

## Performance

- **~1000+ combinations per second** on modern hardware
- **Proper yielding**: Non-blocking event loop allows CTRL+C and UI updates
- **Memory efficient**: Optimized data structures and minimal allocations
- **Scalable**: Performance scales with CPU and memory capabilities

## File Structure

```
├── main.js                    # Main recovery program
├── hash_database.js          # Binary database interface
├── bitcoin_addresses_hash_only.db  # Binary hash database (39M+ addresses)
├── list_ph_shuffled.txt      # Shuffled BIP39 wordlist for combinations
├── recovery_checkpoint.json  # Progress checkpoint (auto-generated)
└── found_seed_*.txt         # Found seed phrases (if any)
```

## Technical Details

### **Bitcoin Address Generation**
- Uses **bitcoinjs-lib**, **bip39**, and **bip32** libraries for authentic Bitcoin cryptography
- Generates addresses using BIP44 derivation path: `m/44'/0'/0'/0/0` through `m/44'/0'/0'/0/19`
- Creates P2PKH (Pay-to-Public-Key-Hash) legacy Bitcoin addresses
- Validates seed phrases using BIP39 checksum before processing

### **Database Format**
- **Header**: Magic bytes "BTCHASH1" + count + hash size
- **Data**: Sorted array of 64-bit xxHash64 values
- **Size**: 39,291,252 hashes × 8 bytes = ~300MB
- **Source**: Bitcoin addresses with confirmed positive balances

### **Checkpoint Resume**
The system automatically resumes from where it left off. On startup, you'll see:
```
Previous checkpoint found!
Resuming from combination: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 87, 262]
Combinations already checked: 1,234,567
Previous seeds found: 0
Previous session time: 2h 15m 30s
```

## Starting Point

The system includes a pre-configured starting checkpoint, so you can begin testing immediately. The current progress shows combinations already tested, allowing you to understand the scope and scale of the search space.

**Estimated search space**: ~11.3 × 10³⁰ possible combinations
**Current progress**: Check the dashboard for real-time statistics

## Usage

1. **Install dependencies**: `npm install`
2. **Run the program**: `node main.js`
3. **Monitor progress**: Live dashboard updates every second
4. **Stop/Resume**: CTRL+C to stop, restart to resume from checkpoint
5. **Check results**: Any found seed phrases saved to timestamped files

## Security & Ethics

This tool is designed for **legitimate recovery purposes only**:
- Recovering lost or forgotten seed phrases
- Testing seed phrase security
- Academic research on Bitcoin address space
- Educational cryptography demonstrations

**Please use responsibly and legally.**

## Output Examples

When a seed phrase with balance is found:
```
SEED PHRASE FOUND!
Seed: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
Addresses with balance found: 3
After 2h 15m 30s of searching
Attempts: 1,234,567

   m/44'/0'/0'/0/0: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
   m/44'/0'/0'/0/1: 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2
   m/44'/0'/0'/0/5: 1JQheacLPdM5ySCkrZkV66G2ApzXe1ANXa

Saved to: found_seed_2024-01-15T10-30-45-123Z.txt
```

## Contact & Support

For questions, information, networking, or technical discussions, feel free to message without any problem. Whether you want to discuss the implementation, share improvements, or just chat about Bitcoin cryptography - all contact is welcome!

## Donations

If you find this tool useful or interesting, Bitcoin donations are appreciated:

**BTC**: `bc1q25aq77kkg99rl3aure2u8gayujpr0ul07v6cuc`

---

*This project demonstrates the intersection of cryptography, combinatorics, and high-performance computing in the Bitcoin ecosystem.*