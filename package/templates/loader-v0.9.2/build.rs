fn main() {
    println!("cargo:rerun-if-changed=loader.rc");
    if std::process::Command::new("windres")
        .args(["loader.rc", "-O", "coff", "-o", "loader.res"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
    {
        println!("cargo:rustc-link-arg=loader.res");
    }
}