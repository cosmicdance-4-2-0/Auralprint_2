/** Public interface stub for packaging and downloading captured output. */
export function createExportGateway() {
  return {
    createDownloadableArtifact() {},
    revokeArtifact() {}
  };
}
