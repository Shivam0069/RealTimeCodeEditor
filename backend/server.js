const http = require("http");
const app = require("./app");
const { initializeSocket } = require("./socket");

const server = http.createServer(app);

initializeSocket(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
