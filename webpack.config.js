const path = require("path");
module.exports = {
  entry: {
    auth: "./src/client/js/auth.js",
    home: "./src/client/js/home.js",
    communityPostDetail: "./src/client/js/communityPostDetail.js",
    community: "./src/client/js/community.js",
    createCommunityPost: "./src/client/js/createCommunityPost.js",
  },
  watch: true,
  mode: "development",
  output: {
    clean: true,
    filename: "[name].js",
    path: path.resolve(__dirname, "assets", "js"),
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [["@babel/preset-env", { targets: "defaults" }]],
          },
        },
      },
    ],
  },
};
