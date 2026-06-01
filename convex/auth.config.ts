export default {
  providers: [
    {
      // Convex Auth issues tokens against your deployment's own domain.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
