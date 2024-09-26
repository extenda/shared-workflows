const fs = require("fs");
const path = require("path");

const BUILD_DIR = process.env.BUILD_DIR;
const SERVICE_NAME = process.env.SERVICE_NAME;
const SERVICE_VERSION = process.env.SERVICE_VERSION;

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
const ELASTICSEARCH_API_KEY = process.env.ELASTICSEARCH_API_KEY;

// Helper function to get existing source maps from Elasticsearch
async function getExistingSourceMaps() {
  try {
    const response = await fetch(ELASTICSEARCH_URL, {
      method: "GET",
      headers: {
        Authorization: `ApiKey ${ELASTICSEARCH_API_KEY}`,
        "Content-Type": "multipart/form-data",
      },
    });
    if (!response.ok)
      throw new Error(`Failed to fetch source maps: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching source maps: ${error.message}`);
  }
}

// Function to get source maps from the build directory
function getBuildSourceMaps() {
  try {
    const filePath = path.join(__dirname, BUILD_DIR);
    console.log(filePath);
    const files = fs.readdirSync(filePath);

    return files
      .filter((file) => file.endsWith(".map"))
      .map((file) => ({
        mapFileName: file,
        jsFileName: file.replace(".map", ""),
      }));
  } catch (error) {
    console.error(`Error reading build directory: ${error.message}`);
    process.exit(1);
  }
}

// Helper function to delete a source map from Elasticsearch
async function deleteSourceMaps(sourceMapsToDelete) {
  const deletePromises = sourceMapsToDelete.map(async (artifactId) => {
    try {
      const headers = {
        Authorization: `ApiKey ${ELASTICSEARCH_API_KEY}`,
        "KBN-XSRF": "True",
      };
      const response = await fetch(`${ELASTICSEARCH_URL}/${artifactId}`, {
        method: "DELETE",
        headers: headers,
      });
      return {
        artifactId,
        success: response.ok,
        statusText: response.statusText,
      };
    } catch (error) {
      return { artifactId, success: false, error: error.message };
    }
  });

  return await Promise.all(deletePromises);
}

// Helper function to upload a new source map to Elasticsearch
async function uploadSourceMap(sourceMapsToUpload) {
  const uploadPromises = sourceMapsToUpload.map(
    async ({ jsFileName, mapFileName }) => {
      const formData = new FormData();

      formData.append(
        "sourcemap",
        fs.readFileSync(path.join(__dirname, BUILD_DIR, mapFileName))
      );
      formData.append("service_version", SERVICE_VERSION);
      formData.append("bundle_filepath", `/recon/${jsFileName}`);
      formData.append("service_name", SERVICE_NAME);

      try {
        const headers = {
          Authorization: `ApiKey ${ELASTICSEARCH_API_KEY}`,
          "kbn-xsrf": true,
        };
        const response = await fetch(ELASTICSEARCH_URL, {
          method: "POST",
          headers: headers,
          body: formData,
        });
        return {
          mapFileName,
          success: response.ok,
          statusText: response.statusText,
        };
      } catch (error) {
        return { mapFileName, success: false, error: error.message };
      }
    }
  );

  return await Promise.all(uploadPromises);
}

(async function manageSourceMaps() {
  try {
    const { artifacts } = await getExistingSourceMaps();

    if (artifacts.length) {
      const sourceMapsToDelete = artifacts
        .filter(
          ({ body }) =>
            body.serviceName === SERVICE_NAME &&
            body.serviceVersion === SERVICE_VERSION &&
            body.bundleFilepath.startsWith("/recon/")
        )
        .map(({ id }) => id);

      const deleteResults = await deleteSourceMaps(sourceMapsToDelete);
      const failedDeletes = deleteResults.filter(({ success }) => !success);

      if (failedDeletes.length) {
        throw new Error(
          `Error deleting source maps: ${JSON.stringify(
            failedDeletes,
            null,
            2
          )}`
        );
      }
    }

    const sourceMapsToUpload = getBuildSourceMaps();
    const uploadResults = await uploadSourceMap(sourceMapsToUpload);
    const failedUploads = uploadResults.filter(({ success }) => !success);

    if (failedUploads.length) {
      throw new Error(
        `Error uploading source maps: ${JSON.stringify(failedUploads, null, 2)}`
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
})();
