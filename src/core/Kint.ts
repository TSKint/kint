import { KintRequest } from "./models/KintRequest";
import { mergeDefaultWithMissingItems } from "../utils/mergeDefaultWithMissingItems";
import { extendObject } from "../utils/extendObject";
import { KintExport } from "./models/KintExport";
import { MaybeFunction, Middleware } from "./models/Middleware";
import { getFromFnOrValue } from "../utils/getFromFnOrValue";
import { KintEndpointMeta } from "./models/KintEndpointMeta";
import { HandlerBuilder } from "./models/HandlerBuilder";
import { ConfigurableHandler } from "./models/ConfigurableHandler";
import { Extend } from "../utils/types/Extend";
import { NotKeyOf } from "../utils/types/NotKeyOf";
import { DefineEndpointFunctionArgs } from "./models/DefineEndpointFunction";
import { ValidatorArray } from "./models/Validator";
import { extractParts } from "./extractParts";
import { wrapHandlerWithValidationLayer } from "./handlerWithValidators";

export type StringKeysOnly<T> = {
  [K in keyof T]: K extends string ? K : never;
};

//TODO: Add more information and examples on how to use the class
/**
 * The main class that is used to define endpoints and build a router
 */
export class Kint<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Context extends Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Config extends Record<string, any>,
  DefaultConfig,
> {
  /**
   * Creates a new Kint object. This is the starting point for defining endpoints.
   * @returns A new Kint instance with a global context object.
   */
  public static new<GlobalContext>() {
    type Context = {
      global: GlobalContext;
    };

    type Config = {};

    return new Kint<Context, Config, {}>(
      {},
      {
        buildConfigurableHandler: <
          FullContext extends Context,
          FullConfig extends Config,
        >(
          innerHandler: ConfigurableHandler<FullContext, FullConfig>,
        ) => innerHandler,
      },
    );
  }

  private defaultConfig: DefaultConfig;

  /**
   * Builds a new handler with all the previous middleware applied to it.
   */
  private handlerBuilder: HandlerBuilder<Context, Config>;

  private constructor(
    defaultConfig: DefaultConfig,
    handlerBuilder: HandlerBuilder<Context, Config>,
  ) {
    this.defaultConfig = defaultConfig;
    this.handlerBuilder = handlerBuilder;
  }

  /**
   * Extends the default config object. Takes a partial object to extend the default config object with.
   * @param extension A partial object to extend the default config object with.
   * @returns A new Kint instance with the new default config object.
   */
  extendConfig<DefaultConfigExtension extends Partial<Config>>(
    extension: DefaultConfigExtension,
  ) {
    return new Kint<Context, Config, DefaultConfig & DefaultConfigExtension>(
      extendObject(this.defaultConfig, extension),
      this.handlerBuilder,
    );
  }

  /**
   * Creates a new Kint with the middleware added.
   * @param middleware The middleware to extend the kint instance with
   * @returns A new Kint instance with the middleware added.
   */
  addMiddleware<Name extends string, ContextExt, ConfigExt>(
    middleware: Middleware<NotKeyOf<Name, Config>, ContextExt, ConfigExt>,
  ) {
    // Create a new handler builder which wraps the

    /**
     *
     * @param innermostHandler The handler that this middleware will wrap.
     * @returns A new handler which passes the inner handler into it.
     */

    const newHandlerBuilder: HandlerBuilder<
      Extend<Context, ContextExt, Name>,
      Extend<Config, ConfigExt, Name>
    > = {
      buildConfigurableHandler: <
        FullContext extends Extend<Context, ContextExt, Name>,
        FullConfig extends Extend<Config, ConfigExt, Name>,
      >(
        innermostHandler: ConfigurableHandler<
          Extend<Context, ContextExt, Name>,
          Extend<Config, ConfigExt, Name>
        >,
      ) => {
        // Builds a handler using the previous handler builder to wrap the innermost handler.
        const wrappedInnerHandler =
          this.handlerBuilder.buildConfigurableHandler<FullContext, FullConfig>(
            innermostHandler,
          );

        // Returns a new handler that wraps the handler generated by the previous handler builder.
        return (
          request: KintRequest,
          context: FullContext,
          config: FullConfig,
        ) =>
          middleware.handler(
            request,
            // Next function simply extends the context object with the extension object and calls the inner handler.
            // eslint-disable-next-line no-type-assertion/no-type-assertion -- Necessary evil to make the types work :/
            ((extension?: ContextExt) => {
              if (extension)
                (context as Record<Name, ContextExt>)[middleware.name] =
                  extension;
              return wrappedInnerHandler(request, context, config);
            }) as MaybeFunction<ContextExt>,
            config[middleware.name],
          );
      },
    };

    // Creates a new kint object with the new handler builder.
    return new Kint<
      Extend<Context, ContextExt, Name>,
      Extend<Config, ConfigExt, Name>,
      DefaultConfig
    >(this.defaultConfig, newHandlerBuilder);
  }

  /**
   * Overrides the config object with a new one. This can be a partial object or a function that takes the current config object and returns a new one.
   * @param newConfig A new config object or a function that takes the current config object and returns a new one.
   * @returns A new Kint instance with the new config object.
   */
  setConfig<NewDefaultConfig extends Partial<Config>>(
    newConfig: ((config: DefaultConfig) => NewDefaultConfig) | NewDefaultConfig,
  ) {
    const resolvedNewConfig = getFromFnOrValue(newConfig, this.defaultConfig);

    return new Kint<Context, Config, NewDefaultConfig>(
      resolvedNewConfig,
      this.handlerBuilder,
    );
  }

  defineEndpoint<Validators extends ValidatorArray>(
    ...args: DefineEndpointFunctionArgs<
      Context,
      Config,
      DefaultConfig,
      Validators
    >
  ): KintExport<KintEndpointMeta<Context, Config>> {
    const { config, validators, handler } = extractParts(...args);

    // Merges the config from the user with the default config.
    const mergedConfig = mergeDefaultWithMissingItems<Config, DefaultConfig>(
      this.defaultConfig,
      config,
    );

    const handlerWithMiddleware = this.handlerBuilder.buildConfigurableHandler(
      wrapHandlerWithValidationLayer(handler, validators),
    );

    return {
      builtByKint: true,
      data: {
        config: mergedConfig,
        handler: (request, context) =>
          handlerWithMiddleware(request, context, mergedConfig),
        data: "KintEndpointMeta",
      },
    };
  }
}
