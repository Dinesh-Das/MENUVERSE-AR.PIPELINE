"""Read-only resource resolution for untrusted glTF/GLB assets."""
from pathlib import Path
from urllib.parse import unquote, urlsplit

from trimesh.resolvers import Resolver


class UploadAssetResolver(Resolver):
    def __init__(self, directory: Path, upload_root: Path, failures: list[str] | None = None):
        self.directory = directory.resolve()
        self.upload_root = upload_root.resolve()
        self.failures = failures if failures is not None else []
        if not self.directory.is_relative_to(self.upload_root):
            raise ValueError("Asset directory must be inside uploads.")

    def _path(self, name: str) -> Path:
        uri = urlsplit(name)
        decoded = unquote(uri.path)
        relative = Path(decoded)
        if (uri.scheme or uri.netloc or uri.query or uri.fragment
                or relative.anchor or "\\" in decoded):
            raise ValueError("Only upload-relative asset resources are supported.")
        path = (self.directory / relative).resolve()
        if path == self.upload_root or not path.is_relative_to(self.upload_root):
            raise ValueError("Asset resource must remain inside uploads.")
        return path

    def get(self, key):
        try:
            return self._path(key).read_bytes()
        except (OSError, ValueError, RuntimeError):
            # Trimesh may swallow a missing/invalid texture error. The caller
            # checks this shared list before accepting even a partial model.
            self.failures.append(str(key))
            raise

    def namespaced(self, namespace):
        return UploadAssetResolver(self._path(namespace), self.upload_root, self.failures)

    def write(self, name, data):
        raise ValueError("Uploaded asset resources are read-only.")
