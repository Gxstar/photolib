use photolib_lib::commands::build_enriched_skeleton_for_test;
use std::path::PathBuf;

#[test]
fn returns_empty_for_nonexistent_dir() {
    let r = build_enriched_skeleton_for_test(&PathBuf::from("Z:/__nope_does_not_exist__"));
    assert!(r.is_ok());
    assert_eq!(r.unwrap().len(), 0);
}
