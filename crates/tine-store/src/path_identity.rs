//! Resolve an existing filesystem path for graph identity and containment.
//! Prefer the filesystem's canonical answer; when a volume cannot provide it,
//! return an absolute spelling only after proving the entry exists and the
//! fallback path contains no symlink or Windows reparse point. Cost is O(path
//! components) on fallback. A missing or unsafe fallback returns the original
//! canonicalization error. Distinct spellings may identify one physical root.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Refuse Windows-created files in WSL1's backing rootfs: those writes bypass
/// Linux metadata and can corrupt it. Inspect the resolved parent too, so a
/// directory junction cannot bypass the refusal. Existing graphs stay openable.
pub(crate) fn check_new_graph_parent(parent: &Path) -> Result<(), crate::OpenError> {
    #[cfg(windows)]
    {
        let resolved =
            canonical_existing_path(parent).map_err(|error| crate::OpenError::Io(error.into()))?;
        check_new_graph_parent_paths(parent, &resolved)?;
    }
    #[cfg(not(windows))]
    let _ = parent;
    Ok(())
}

#[cfg(any(windows, test))]
fn check_new_graph_parent_paths(parent: &Path, resolved: &Path) -> Result<(), crate::OpenError> {
    if tine_core::graph_paths::is_windows_wsl_rootfs(&parent.to_string_lossy())
        || tine_core::graph_paths::is_windows_wsl_rootfs(&resolved.to_string_lossy())
    {
        return Err(crate::OpenError::CreateFailed {
            path: parent.to_path_buf(),
            cause: io::Error::new(io::ErrorKind::InvalidInput,
                "Windows access to a WSL1 rootfs can corrupt Linux files. Use \\\\wsl.localhost\\<distro>\\… instead.").into(),
        });
    }
    Ok(())
}

pub(crate) fn canonical_existing_path(path: &Path) -> io::Result<PathBuf> {
    canonical_existing_path_with(path, |path| fs::canonicalize(path))
}

pub(crate) fn canonical_existing_path_with(
    path: &Path,
    canonicalize: impl FnOnce(&Path) -> io::Result<PathBuf>,
) -> io::Result<PathBuf> {
    match canonicalize(path) {
        Ok(resolved) => Ok(resolved),
        Err(original) => {
            let Ok(absolute) = std::path::absolute(path) else {
                return Err(original);
            };
            if fs::metadata(&absolute).is_err() || has_link_component(&absolute) {
                return Err(original);
            }
            Ok(absolute)
        }
    }
}

fn has_link_component(path: &Path) -> bool {
    path.ancestors().any(|ancestor| {
        let Ok(metadata) = fs::symlink_metadata(ancestor) else {
            return true;
        };
        if metadata.file_type().is_symlink() {
            return true;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return true;
            }
        }
        false
    })
}

#[cfg(test)]
mod canonical_root_fallback_tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn new_graph_refuses_both_selected_and_resolved_wsl_rootfs_parents() {
        let unsafe_root = Path::new(r"C:\Users\m\Packages\Ubuntu_123\LocalState\rootfs\home\m");
        let safe_root = Path::new(r"C:\notes");
        for (parent, resolved) in [(unsafe_root, safe_root), (safe_root, unsafe_root)] {
            let error = check_new_graph_parent_paths(parent, resolved).unwrap_err();
            let crate::OpenError::CreateFailed { path, cause } = error else {
                panic!("expected a creation refusal");
            };
            assert_eq!(path, parent);
            assert!(cause.message.contains("corrupt Linux files"));
            assert!(cause.message.contains(r"\\wsl.localhost\<distro>\"));
        }
        let network = Path::new(r"\\wsl.localhost\Ubuntu\home\m");
        assert!(check_new_graph_parent_paths(network, network).is_ok());
        assert!(check_new_graph_parent_paths(safe_root, safe_root).is_ok());
    }

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "tine-root-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn existing_root_uses_absolute_spelling_when_canonicalization_fails() {
        let root = test_root("fallback");
        let spelling = root.join(".");
        let fallback = canonical_existing_path_with(&spelling, |_| {
            Err(std::io::Error::from_raw_os_error(1005))
        })
        .unwrap();
        assert!(fallback.is_absolute());
        assert!(fallback.is_dir());
        assert!(!fallback.components().any(|part| part.as_os_str() == "."));
        assert_eq!(fallback, std::path::absolute(&spelling).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_root_keeps_the_original_canonicalization_error() {
        let root = test_root("missing");
        let missing = root.join("missing");
        let error = canonical_existing_path_with(&missing, |_| {
            Err(std::io::Error::from_raw_os_error(1005))
        })
        .unwrap_err();
        assert_eq!(error.raw_os_error(), Some(1005));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fallback_applies_to_other_canonicalization_errors_but_not_links() {
        let root = test_root("other-errors");
        let fallback = canonical_existing_path_with(&root, |_| {
            Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
        })
        .unwrap();
        assert_eq!(fallback, std::path::absolute(&root).unwrap());
        #[cfg(unix)]
        {
            let link = root.with_extension("link");
            std::os::unix::fs::symlink(&root, &link).unwrap();
            assert!(canonical_existing_path_with(&link, |_| {
                Err(std::io::Error::from_raw_os_error(1005))
            })
            .is_err());
            fs::remove_file(link).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }
}
