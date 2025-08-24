const HashOnlyBTCDB = require('./hash_database.js');
const fs = require('fs');

// Import Bitcoin libraries
const bip39 = require('bip39');
const bitcoin = require('bitcoinjs-lib');

// Import ECC library for BIP32
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(ecc);

class SeedPermutationRecovery {
    constructor() {
        this.database = new HashOnlyBTCDB();
        this.wordlist = [];
        this.totalCombinations = 0;
        this.checkedCombinations = 0;
        this.sessionCombinations = 0;
        this.foundSeeds = [];
        this.startTime = Date.now();
        this.sessionStartTime = Date.now();
        this.checkpointFile = 'recovery_checkpoint.json';
        this.currentIndices = null;
        this.displayInitialized = false;
    }

    // Load database and wordlist
    async initialize() {
        // Clear console for clean startup
        console.clear();
        
        console.log('\x1b[36m=== BTC Brute Force Recovery ===\x1b[0m\n');
        
        // Load database
        console.log('\x1b[33mLoading hash-only database...\x1b[0m');
        if (!this.database.loadDatabase('bitcoin_addresses_hash_only.db')) {
            throw new Error('Cannot load database!');
        }
        console.log('\x1b[32mDatabase loaded successfully\x1b[0m\n');
        
        // Load wordlist
        console.log('\x1b[33mLoading BIP39 wordlist...\x1b[0m');
        this.loadWordlist();
        console.log(`\x1b[32mWordlist loaded: ${this.wordlist.length} words\x1b[0m\n`);
        
        // Calculate total possible combinations
        this.calculateTotalCombinations();
        
        // Try to load previous checkpoint
        this.loadCheckpoint();
    }
    
    // Load wordlist from file
    loadWordlist() {
        try {
            if (fs.existsSync('list_ph_shuffled.txt')) {
                const content = fs.readFileSync('list_ph_shuffled.txt', 'utf-8');
                this.wordlist = content.split('\n')
                    .map(w => w.trim())
                    .filter(w => w && w.length > 0);
            } else {
                throw new Error('File list_ph_shuffled.txt not found');
            }
        } catch (error) {
            console.error(`Error loading wordlist: ${error.message}`);
            process.exit(1);
        }
    }
    
    // Calculate total number of possible combinations
    calculateTotalCombinations() {
        // Combinations without repetition: C(n,12) = n!/(12!(n-12)!)
        // Simplified approximation
        const n = this.wordlist.length;
        if (n >= 12) {
            // Approximate estimate for combinations
            this.totalCombinations = Math.floor(Math.pow(n, 12) / (12 * 11 * 10 * 9 * 8 * 7 * 6 * 5 * 4 * 3 * 2 * 1));
            console.log(`\x1b[35mEstimated possible combinations: ~${this.formatNumber(this.totalCombinations)}\x1b[0m`);
        } else {
            console.log(`Wordlist too small: ${n} words (minimum 12 required)`);
            process.exit(1);
        }
    }
    
    // Generate a combination of 12 words (without repetition)
    generateCombination(wl, indices) {
        return [
            wl[indices[0]], wl[indices[1]], wl[indices[2]], wl[indices[3]],
            wl[indices[4]], wl[indices[5]], wl[indices[6]], wl[indices[7]],
            wl[indices[8]], wl[indices[9]], wl[indices[10]], wl[indices[11]]
        ].join(' ');
    }

    
    // k=12, n=2048 ⇒ n-k = 2036
    nextCombination(indices) {
        let i = 11;
        while (i >= 0 && indices[i] === 2036 + i) i--;
        if (i < 0) return false;

        const val = ++indices[i];
        switch (11 - i) {        // quanti elementi vanno riempiti dopo i
            case 11: indices[i+11] = val + 11;
            case 10: indices[i+10] = val + 10;
            case 9:  indices[i+9]  = val + 9;
            case 8:  indices[i+8]  = val + 8;
            case 7:  indices[i+7]  = val + 7;
            case 6:  indices[i+6]  = val + 6;
            case 5:  indices[i+5]  = val + 5;
            case 4:  indices[i+4]  = val + 4;
            case 3:  indices[i+3]  = val + 3;
            case 2:  indices[i+2]  = val + 2;
            case 1:  indices[i+1]  = val + 1;
            default: break;       // se i==11 non fa nulla
        }
        return true;
    }

    
    // Generate Bitcoin addresses from seed phrase
    generateAddresses(seedPhrase, count = 20) {
        try {
            // Verify that it's a valid BIP39 mnemonic
            if (!bip39.validateMnemonic(seedPhrase)) {
                return [];
            }
            
            // Generate seed
            const seed = bip39.mnemonicToSeedSync(seedPhrase);
            
            // Create master HD node
            const root = bip32.fromSeed(seed);
            
            // Derive BIP44 account m/44'/0'/0'/0
            const account = root
                .deriveHardened(44)   // purpose: BIP44
                .deriveHardened(0)    // coin: Bitcoin
                .deriveHardened(0)    // account: 0
                .derive(0);           // change: 0
            
            // Generate first N addresses
            const addresses = [];
            for (let i = 0; i < count; i++) {
                const child = account.derive(i);
                const { address } = bitcoin.payments.p2pkh({
                    pubkey: child.publicKey,
                    network: bitcoin.networks.bitcoin
                });
                addresses.push(address);
            }
            
            return addresses;
            
        } catch (error) {
            return [];
        }
    }
    
    // Check if a seed phrase has addresses with balance
    checkSeedPhrase(seedPhrase) {
        const addresses = this.generateAddresses(seedPhrase);
        const foundAddresses = new Array(12);
        let found = false;

        for (let i = 0, len = addresses.length; i < len; i++) {
            const address = addresses[i];
            if (this.database.hasAddress(address)) {
                found = true;
                foundAddresses.push({
                    index: i,
                    address,
                    path: "m/44'/0'/0'/0/" + i // concatenazione leggermente più veloce di template literal
                });
            }
        }

        return [foundAddresses, found];
    }

    
    // Save found seed phrase to file
    saveSeedPhrase(seedPhrase, foundAddresses) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `found_seed_${timestamp}.txt`;
        
        let content = `SEED PHRASE FOUND!\n`;
        content += `Date: ${new Date().toLocaleString()}\n`;
        content += `Search time: ${this.getElapsedTime()}\n`;
        content += `Combinations tested: ${this.formatNumber(this.checkedCombinations)}\n\n`;
        content += `SEED PHRASE:\n${seedPhrase}\n\n`;
        content += `ADDRESSES WITH BALANCE FOUND:\n`;
        
        foundAddresses.forEach(found => {
            content += `Path: ${found.path}\n`;
            content += `Address: ${found.address}\n\n`;
        });
        
        fs.writeFileSync(filename, content, 'utf-8');
        console.log(`Seed phrase saved to: ${filename}`);
        
        return filename;
    }
    
    // Initialize the fixed display with current values
    initializeDisplay() {
        if (this.displayInitialized) return;
        
        // Get current combination text
        let currentCombText = '[N/A]';
        if (this.currentIndices) {
            currentCombText = '[' + this.currentIndices.join(', ') + ']';
        }
        
        console.log('\n' + '\x1b[36m' + '='.repeat(80) + '\x1b[0m');
        console.log('\x1b[36m                      BRUTE FORCE PROGRESS STATUS\x1b[0m');
        console.log('\x1b[36m' + '='.repeat(80) + '\x1b[0m');
        console.log('\x1b[37m  Total Combinations Tested:\x1b[0m ' + '\x1b[32m' + this.formatNumber(this.checkedCombinations).padStart(15) + '\x1b[0m');
        console.log('\x1b[37m  Session Combinations:\x1b[0m       ' + '\x1b[32m' + this.formatNumber(this.sessionCombinations).padStart(15) + '\x1b[0m');
        console.log('\x1b[37m  Seeds Found:\x1b[0m                ' + '\x1b[31m' + this.foundSeeds.length.toString().padStart(15) + '\x1b[0m');
        console.log('\x1b[33m' + '-'.repeat(80) + '\x1b[0m');
        console.log('\x1b[37m  Session Time:\x1b[0m               ' + '\x1b[35m' + this.getSessionTime().padStart(15) + '\x1b[0m');
        console.log('\x1b[37m  Session Speed:\x1b[0m              ' + '\x1b[34m0 comb/sec'.padStart(15) + '\x1b[0m');
        console.log('\x1b[33m' + '-'.repeat(80) + '\x1b[0m');
        console.log('\x1b[37m  Current Combination:\x1b[0m');
        console.log('\x1b[90m  ' + currentCombText + '\x1b[0m');
        console.log('\x1b[36m' + '='.repeat(80) + '\x1b[0m');
        console.log(''); // Extra line for spacing
        
        this.displayInitialized = true;
    }
    
    // Update the fixed display with current values
    showProgress() {
        if (!this.displayInitialized) {
            this.initializeDisplay();
            return; // Exit dopo inizializzazione
        }
        
        const sessionElapsedMs = Date.now() - this.sessionStartTime;
        const sessionElapsedSec = sessionElapsedMs / 1000;
        const sessionRate = sessionElapsedSec > 0 ? Math.floor(this.sessionCombinations / sessionElapsedSec) : 0;
        
        // Move cursor up 12 lines to overwrite the display
        process.stdout.write('\x1b[12A');
        
        // Get current combination indices
        let currentCombText = '[N/A]';
        if (this.currentIndices) {
            currentCombText = '[' + this.currentIndices.join(', ') + ']';
        }
        
        // Clear and update each line with colors
        process.stdout.write('\x1b[K\x1b[37m  Total Combinations Tested:\x1b[0m ' + '\x1b[32m' + this.formatNumber(this.checkedCombinations).padStart(15) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[37m  Session Combinations:\x1b[0m       ' + '\x1b[32m' + this.formatNumber(this.sessionCombinations).padStart(15) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[37m  Seeds Found:\x1b[0m                ' + (this.foundSeeds.length > 0 ? '\x1b[31m' : '\x1b[31m') + this.foundSeeds.length.toString().padStart(15) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[33m' + '-'.repeat(80) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[37m  Session Time:\x1b[0m               ' + '\x1b[35m' + this.getSessionTime().padStart(15) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[37m  Session Speed:\x1b[0m              ' + '\x1b[34m' + this.formatNumber(sessionRate).padStart(11) + ' comb/sec\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[33m' + '-'.repeat(80) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[37m  Current Combination:\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[90m  ' + currentCombText + '\x1b[0m\n');
        process.stdout.write('\x1b[K\x1b[36m' + '='.repeat(80) + '\x1b[0m\n');
        process.stdout.write('\x1b[K\n'); // Extra line for spacing
        process.stdout.write('\x1b[K\n'); // Keep cursor position
    }
    
    // Get session elapsed time
    getSessionTime() {
        const elapsed = Date.now() - this.sessionStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    // Start brute force with permutations
    async startPermutationSearch() {
        console.log(`\x1b[32mStarting permutation search (unlimited)\x1b[0m\n`);
        
        // Initialize or restore indices from checkpoint
        let indices;
        if (this.currentIndices) {
            indices = [...this.currentIndices];
            console.log(`\x1b[33mResuming from indices: [${indices.join(', ')}]\x1b[0m\n`);
        } else {
            // Initialize first combination [0,1,2,3,4,5,6,7,8,9,10,11]
            indices = [];
            for (let i = 0; i < 12; i++) {
                indices[i] = i;
            }
            console.log('\x1b[33mStarting from first combination: [0,1,2,3,4,5,6,7,8,9,10,11]\x1b[0m\n');
        }
        
        let attempts = 0;
        let running = true;
        
        // Show initial progress
        console.log('\x1b[32mSearch started! Dashboard updates every second...\x1b[0m\n');
        
        // Show progress every 1 second with beautiful UI
        const progressInterval = setInterval(() => {
            if (running) {
                this.showProgress();
            }
        }, 1000); // 1 second
        
        // Save checkpoint every 60 seconds
        const checkpointInterval = setInterval(() => {
            if (running) {
                this.currentIndices = [...indices];
                this.saveCheckpoint();
            }
        }, 60000); // 60 seconds

        const wl = this.wordlist;      
        
        try {
            do {
                attempts++;
                this.checkedCombinations++;
                this.sessionCombinations++;
                
                // Update current indices for progress display
                this.currentIndices = [...indices];
                
                // Generate seed phrase from this combination
                const seedPhrase = this.generateCombination(wl, indices);
                
                // Controlla se ha indirizzi con saldo
                const [foundAddresses, found] = this.checkSeedPhrase(seedPhrase);

                if (found) {
                    console.log(`\n\x1b[32m\x1b[5mSEED PHRASE FOUND!\x1b[0m`);
                    console.log(`\x1b[36mSeed:\x1b[0m ${seedPhrase}`);
                    console.log(`\x1b[36mAddresses with balance found:\x1b[0m \x1b[31m${foundAddresses.length}\x1b[0m`);
                    console.log(`\x1b[36mAfter\x1b[0m ${this.getElapsedTime()} \x1b[36mof searching\x1b[0m`);
                    console.log(`\x1b[36mAttempts:\x1b[0m ${this.formatNumber(this.checkedCombinations)}`);
                    
                    foundAddresses.forEach(found => {
                        console.log(`   \x1b[33m${found.path}:\x1b[0m \x1b[32m${found.address}\x1b[0m`);
                    });
                    
                    // Save to file
                    const filename = this.saveSeedPhrase(seedPhrase, foundAddresses);
                    this.foundSeeds.push({
                        seedPhrase,
                        foundAddresses,
                        filename
                    });
                    
                    console.log(`\n\x1b[32mSaved to:\x1b[0m ${filename}`);
                    console.log(`\x1b[35mContinuing search for more seed phrases...\x1b[0m\n`);
                }
                
                if (attempts % 1000 === 0) {
                    await new Promise(resolve => setImmediate(resolve));
                }

                
            } while (this.nextCombination(indices));
            
        } finally {
            running = false;
            clearInterval(progressInterval);
            clearInterval(checkpointInterval);
            
            // Final checkpoint save
            this.currentIndices = [...indices];
            this.saveCheckpoint();
        }
        
        // Final statistics
        console.log(`\n=== SEARCH COMPLETED ===`);
        console.log(`Total time: ${this.getElapsedTime()}`);
        console.log(`Combinations tested: ${this.formatNumber(this.checkedCombinations)}`);
        console.log(`Seed phrases found: ${this.foundSeeds.length}`);
        
        if (this.foundSeeds.length > 0) {
            console.log(`\nSaved files:`);
            this.foundSeeds.forEach((seed, i) => {
                console.log(`   ${i + 1}. ${seed.filename}`);
            });
        } else {
            console.log(`\nNo seed phrases with balance found`);
        }
    }
    
    // Save current progress to checkpoint file
    saveCheckpoint() {
        const checkpoint = {
            indices: this.currentIndices ? [...this.currentIndices] : null,
            checkedCombinations: this.checkedCombinations,
            foundSeeds: this.foundSeeds,
            timestamp: new Date().toISOString(),
            elapsedTime: this.getElapsedTime()
        };
        
        try {
            fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
            console.log(`Checkpoint saved to ${this.checkpointFile}`);
        } catch (error) {
            console.error(`Error saving checkpoint: ${error.message}`);
        }
    }
    
    // Load previous checkpoint if exists
    loadCheckpoint() {
        try {
            if (fs.existsSync(this.checkpointFile)) {
                const checkpoint = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
                
                if (checkpoint.indices) {
                    this.currentIndices = checkpoint.indices;
                    this.checkedCombinations = checkpoint.checkedCombinations || 0;
                    this.foundSeeds = checkpoint.foundSeeds || [];
                    
                    console.log('Previous checkpoint found!');
                    console.log(`Resuming from combination: [${this.currentIndices.join(', ')}]`);
                    console.log(`Combinations already checked: ${this.formatNumber(this.checkedCombinations)}`);
                    console.log(`Previous seeds found: ${this.foundSeeds.length}`);
                    console.log(`Previous session time: ${checkpoint.elapsedTime}`);
                    console.log('');
                    
                    // Reset session start time for current session
                    this.sessionStartTime = Date.now();
                } else {
                    console.log('Checkpoint file exists but no valid indices found, starting fresh');
                }
            } else {
                console.log('No previous checkpoint found, starting from beginning');
            }
        } catch (error) {
            console.log(`Error loading checkpoint: ${error.message}, starting fresh`);
        }
    }
    
    // Utility functions
    formatNumber(num) {
        return num.toLocaleString();
    }
    
    getElapsedTime() {
        const elapsed = Date.now() - this.startTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

// Run if called directly
if (require.main === module) {
    let recoveryInstance = null;
    
    // Handle graceful interruption (Ctrl+C)
    process.on('SIGINT', () => {
        console.log('\n\nSearch interrupted by user');
        
        if (recoveryInstance) {
            console.log('Saving final checkpoint...');
            recoveryInstance.saveCheckpoint();
        }
        
        console.log('Progress saved. You can resume later by running the script again.');
        process.exit(0);
    });
    
    async function main() {
        recoveryInstance = new SeedPermutationRecovery();
        
        try {
            // Initialization
            await recoveryInstance.initialize();
            
            // Start search (no limit - go to infinity)
            await recoveryInstance.startPermutationSearch();
            
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }
    
    main();
}

module.exports = SeedPermutationRecovery;