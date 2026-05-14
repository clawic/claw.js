// @ts-nocheck
export function createClawContentIotFacades(locals: Record<string, any>): Record<string, any> {
  const { contentClient, iotClient, requireContentClient, requireIotClient, options } = locals;

  return {
    content: {
      configured: Boolean(contentClient),
      brands: {
        list: async () => requireContentClient().listBrands(),
        create: async (input) => requireContentClient().createBrand(input),
        update: async (id, input) => requireContentClient().updateBrand(id, input),
      },
      destinations: {
        list: async (filters) => requireContentClient().listDestinations(filters),
        create: async (input) => requireContentClient().createDestination(input),
        update: async (id, input) => requireContentClient().updateDestination(id, input),
        testConnection: async (id) => requireContentClient().testConnection(id),
        view: async () => requireContentClient().destinationsReadModel(),
      },
      campaigns: {
        list: async (filters) => requireContentClient().listCampaigns(filters),
        create: async (input) => requireContentClient().createCampaign(input),
        update: async (id, input) => requireContentClient().updateCampaign(id, input),
      },
      entries: {
        list: async (filters) => requireContentClient().listEntries(filters),
        get: async (id) => requireContentClient().getEntry(id),
        create: async (input) => requireContentClient().createEntry(input),
        update: async (id, input) => requireContentClient().updateEntry(id, input),
        archive: async (id) => requireContentClient().archiveEntry(id),
        attachAsset: async (id, input) => requireContentClient().attachAsset(id, input),
        generateVariants: async (id, input) => requireContentClient().generateVariants(id, input),
      },
      variants: {
        list: async (filters) => requireContentClient().listVariants(filters),
        create: async (input) => requireContentClient().createVariant(input),
        update: async (id, input) => requireContentClient().updateVariant(id, input),
      },
      approvals: {
        list: async (filters) => requireContentClient().listApprovals(filters),
        approve: async (id, input) => requireContentClient().approve(id, input),
        reject: async (id, input) => requireContentClient().reject(id, input),
        cancel: async (id) => requireContentClient().cancelApproval(id),
        view: async () => requireContentClient().approvalsReadModel(),
      },
      calendar: {
        view: async () => requireContentClient().calendar(),
      },
      publish: {
        listPlans: async (filters) => requireContentClient().listPlans(filters),
        createPlan: async (input) => requireContentClient().createPlan(input),
        cancelPlan: async (id) => requireContentClient().cancelPlan(id),
        runNow: async (id) => requireContentClient().runPlan(id),
        schedulerRun: async () => requireContentClient().schedulerRun(),
        listRuns: async () => requireContentClient().listPublications(),
        getRun: async (id) => requireContentClient().getPublication(id),
        retryRun: async (id) => requireContentClient().retryPublication(id),
        view: async () => requireContentClient().publicationsReadModel(),
      },
      app: {
        frontendContract: async () => requireContentClient().frontendContract(),
        screens: async () => requireContentClient().screens(),
        dashboard: async () => requireContentClient().dashboard(),
        pipeline: async () => requireContentClient().pipeline(),
        composer: async (entryId) => requireContentClient().composer(entryId),
        form: async (formId) => requireContentClient().form(formId),
      },
      tokens: {
        list: async () => requireContentClient().listTokens(),
        issue: async (input) => requireContentClient().issueToken(input),
      },
    },
    iot: {
      inventory: {
        homes: {
          list: async () => requireIotClient().listHomes(),
          get: async (homeId) => requireIotClient().getHome(homeId ?? options.iot?.homeId),
        },
        areas: {
          list: async (homeId) => requireIotClient().listAreas(homeId ?? options.iot?.homeId),
        },
        things: {
          list: async (input = {}) => requireIotClient().listThings({
            ...input,
            homeId: input.homeId ?? options.iot?.homeId,
          }),
          get: async (thingId, homeId) => requireIotClient().getThing(thingId, homeId ?? options.iot?.homeId),
          search: async (query, input = {}) => requireIotClient().searchThings(query, {
            ...input,
            homeId: input.homeId ?? options.iot?.homeId,
          }),
        },
      },
      state: {
        get: async (homeId) => requireIotClient().getState(homeId ?? options.iot?.homeId),
        history: async (homeId, queryOptions) => requireIotClient().history(homeId ?? options.iot?.homeId, queryOptions),
        watch: async function* (homeId) {
          for await (const event of requireIotClient().watch(homeId ?? options.iot?.homeId)) {
            yield event;
          }
        },
      },
      actions: {
        run: async (input, homeId) => requireIotClient().runAction(input, homeId ?? options.iot?.homeId),
        lights: {
          off: async (area, homeId) => requireIotClient().runAction({ family: "light", action: "off", ...(area ? { area } : {}) }, homeId ?? options.iot?.homeId),
          on: async (area, homeId) => requireIotClient().runAction({ family: "light", action: "on", ...(area ? { area } : {}) }, homeId ?? options.iot?.homeId),
        },
        climate: {
          set: async (selector, temperature, homeId) => requireIotClient().runAction({
            family: "climate",
            selector,
            action: "set",
            value: temperature,
          }, homeId ?? options.iot?.homeId),
        },
      },
      scenes: {
        list: async (homeId) => requireIotClient().listScenes(homeId ?? options.iot?.homeId),
        activate: async (sceneId, homeId) => requireIotClient().activateScene(sceneId, homeId ?? options.iot?.homeId),
      },
      automations: {
        list: async (homeId) => requireIotClient().listAutomations(homeId ?? options.iot?.homeId),
        create: async (input, homeId) => requireIotClient().createAutomation(input, homeId ?? options.iot?.homeId),
        enable: async (automationId, homeId) => requireIotClient().enableAutomation(automationId, homeId ?? options.iot?.homeId),
        disable: async (automationId, homeId) => requireIotClient().disableAutomation(automationId, homeId ?? options.iot?.homeId),
        run: async (automationId, homeId) => requireIotClient().runAutomation(automationId, homeId ?? options.iot?.homeId),
      },
      policies: {
        evaluate: async (input, homeId) => requireIotClient().evaluatePolicy(input, homeId ?? options.iot?.homeId),
        list: async () => [],
        listApprovals: async (homeId) => requireIotClient().listApprovals(homeId ?? options.iot?.homeId),
        approve: async (approvalId, homeId) => requireIotClient().approve(approvalId, homeId ?? options.iot?.homeId),
        deny: async (approvalId, homeId) => requireIotClient().deny(approvalId, homeId ?? options.iot?.homeId),
      },
      raw: {
        invoke: async (input) => requireIotClient().rawInvoke(input),
      },
    },

  };
}
