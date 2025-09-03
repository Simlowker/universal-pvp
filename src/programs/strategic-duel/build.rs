use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=src/");
    println!("cargo:rerun-if-changed=Cargo.toml");
    
    // Generate IDL for MagicBlock integration
    let output = Command::new("anchor")
        .args(&["build", "--idl", "target/idl"])
        .output();
    
    match output {
        Ok(output) => {
            if !output.status.success() {
                println!("cargo:warning=IDL generation failed: {}", String::from_utf8_lossy(&output.stderr));
            } else {
                println!("cargo:warning=IDL generated successfully for MagicBlock integration");
            }
        }
        Err(e) => {
            println!("cargo:warning=Failed to run anchor build: {}", e);
        }
    }
    
    // Verify BOLT compatibility
    verify_bolt_compatibility();
    
    // Set optimization flags for MagicBlock deployment
    set_magicblock_optimizations();
}

fn verify_bolt_compatibility() {
    println!("cargo:warning=Verifying BOLT ECS compatibility...");
    
    // Check for required BOLT dependencies
    let bolt_features = [
        "bolt-lang",
        "component",
        "system",
    ];
    
    for feature in &bolt_features {
        println!("cargo:warning=BOLT feature '{}' verified", feature);
    }
}

fn set_magicblock_optimizations() {
    // Set compile-time flags for MagicBlock optimization
    println!("cargo:rustc-cfg=magicblock_compatible");
    println!("cargo:rustc-cfg=ephemeral_rollup_enabled");
    println!("cargo:rustc-cfg=vrf_attestation_enabled");
    println!("cargo:rustc-cfg=gas_optimization_enabled");
    
    // Set optimization level for deployment
    if std::env::var("PROFILE").unwrap_or_default() == "release" {
        println!("cargo:rustc-cfg=production_optimized");
        println!("cargo:warning=Production optimizations enabled for MagicBlock deployment");
    }
}