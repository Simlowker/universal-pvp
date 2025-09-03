use bolt_lang::*;

/// Player profile component containing identity and progression data
#[component]
#[derive(Clone, Copy)]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub username: [u8; 32], // Fixed-size array for username
    pub player_class: u8,   // 0=Warrior, 1=Mage, 2=Archer, 3=Rogue
    pub level: u32,
    pub experience: u64,
    pub total_matches: u32,
    pub wins: u32,
    pub losses: u32,
    pub created_at: i64,
    pub last_match_at: i64,
    pub is_active: bool,
}

impl Default for PlayerProfile {
    fn default() -> Self {
        Self {
            owner: Pubkey::default(),
            username: [0u8; 32],
            player_class: 0,
            level: 1,
            experience: 0,
            total_matches: 0,
            wins: 0,
            losses: 0,
            created_at: 0,
            last_match_at: 0,
            is_active: true,
        }
    }
}

/// Base stats component for player attributes
#[component]
#[derive(Clone, Copy)]
pub struct PlayerStats {
    pub health: u32,
    pub attack: u32,
    pub defense: u32,
    pub speed: u32,
    pub mana: u32,
}

impl Default for PlayerStats {
    fn default() -> Self {
        Self {
            health: 100,
            attack: 50,
            defense: 50,
            speed: 50,
            mana: 100,
        }
    }
}

impl PlayerStats {
    pub fn new_warrior() -> Self {
        Self {
            health: 120,
            attack: 85,
            defense: 90,
            speed: 60,
            mana: 30,
        }
    }
    
    pub fn new_mage() -> Self {
        Self {
            health: 80,
            attack: 100,
            defense: 50,
            speed: 70,
            mana: 150,
        }
    }
    
    pub fn new_archer() -> Self {
        Self {
            health: 90,
            attack: 95,
            defense: 60,
            speed: 110,
            mana: 80,
        }
    }
    
    pub fn new_rogue() -> Self {
        Self {
            health: 85,
            attack: 90,
            defense: 55,
            speed: 120,
            mana: 70,
        }
    }
    
    pub fn for_class(player_class: u8) -> Self {
        match player_class {
            0 => Self::new_warrior(),
            1 => Self::new_mage(),
            2 => Self::new_archer(),
            3 => Self::new_rogue(),
            _ => Self::default(),
        }
    }

    /// Calculate level-adjusted stats
    pub fn with_level(mut self, level: u32) -> Self {
        let multiplier = 1.0 + (level as f64 - 1.0) * 0.1;
        self.health = (self.health as f64 * multiplier) as u32;
        self.attack = (self.attack as f64 * multiplier) as u32;
        self.defense = (self.defense as f64 * multiplier) as u32;
        self.speed = (self.speed as f64 * multiplier) as u32;
        self.mana = (self.mana as f64 * multiplier) as u32;
        self
    }
}

/// Current health and mana component for active gameplay
#[component]
#[derive(Clone, Copy)]
pub struct PlayerHealth {
    pub current_health: u32,
    pub max_health: u32,
    pub current_mana: u32,
    pub max_mana: u32,
    pub is_alive: bool,
    pub last_damage_taken: i64,
    pub last_heal_received: i64,
}

impl Default for PlayerHealth {
    fn default() -> Self {
        Self {
            current_health: 100,
            max_health: 100,
            current_mana: 100,
            max_mana: 100,
            is_alive: true,
            last_damage_taken: 0,
            last_heal_received: 0,
        }
    }
}

impl PlayerHealth {
    pub fn new(stats: &PlayerStats) -> Self {
        Self {
            current_health: stats.health,
            max_health: stats.health,
            current_mana: stats.mana,
            max_mana: stats.mana,
            is_alive: true,
            last_damage_taken: 0,
            last_heal_received: 0,
        }
    }

    pub fn take_damage(&mut self, damage: u32, timestamp: i64) -> bool {
        self.current_health = self.current_health.saturating_sub(damage);
        self.last_damage_taken = timestamp;
        
        if self.current_health == 0 {
            self.is_alive = false;
            return true; // Player died
        }
        false
    }

    pub fn heal(&mut self, amount: u32, timestamp: i64) {
        self.current_health = (self.current_health + amount).min(self.max_health);
        self.last_heal_received = timestamp;
    }

    pub fn use_mana(&mut self, amount: u32) -> bool {
        if self.current_mana >= amount {
            self.current_mana -= amount;
            true
        } else {
            false
        }
    }

    pub fn restore_mana(&mut self, amount: u32) {
        self.current_mana = (self.current_mana + amount).min(self.max_mana);
    }

    pub fn health_percentage(&self) -> f64 {
        if self.max_health == 0 {
            return 0.0;
        }
        self.current_health as f64 / self.max_health as f64
    }

    pub fn mana_percentage(&self) -> f64 {
        if self.max_mana == 0 {
            return 0.0;
        }
        self.current_mana as f64 / self.max_mana as f64
    }
}

/// Player position component for spatial gameplay
#[component]
#[derive(Clone, Copy)]
pub struct PlayerPosition {
    pub x: f32,
    pub y: f32,
    pub facing_direction: f32, // Radians
    pub movement_speed: f32,
    pub last_moved: i64,
}

impl Default for PlayerPosition {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            facing_direction: 0.0,
            movement_speed: 1.0,
            last_moved: 0,
        }
    }
}

/// Equipment and items component
#[component]
#[derive(Clone, Copy)]
pub struct PlayerEquipment {
    pub weapon: Option<Pubkey>,     // NFT pubkey
    pub armor: Option<Pubkey>,      // NFT pubkey  
    pub accessory: Option<Pubkey>,  // NFT pubkey
    pub consumables: [Option<Pubkey>; 3], // Max 3 consumable slots
    pub equipment_bonus: PlayerStats, // Bonus stats from equipment
}

impl Default for PlayerEquipment {
    fn default() -> Self {
        Self {
            weapon: None,
            armor: None,
            accessory: None,
            consumables: [None; 3],
            equipment_bonus: PlayerStats::default(),
        }
    }
}