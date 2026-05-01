import multer from "multer";

export function errorHandler(error, _request, response, _next) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(400).json({ message: "Uploaded file exceeds the allowed size limit. Models must be 50MB or smaller, and videos must be 250MB or smaller." });
      return;
    }

    response.status(400).json({ message: error.message });
    return;
  }

  const status = Number(error?.statusCode ?? error?.status);
  const safeStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
  response.status(safeStatus).json({ message: error?.message ?? "Internal server error." });
}
