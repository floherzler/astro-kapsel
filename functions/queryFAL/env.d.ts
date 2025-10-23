declare global {
    namespace NodeJS {
        interface ProcessEnv {
            FAL_API_KEY: string;
            APPWRITE_API_KEY?: string;
            APPWRITE_FUNCTION_API_ENDPOINT?: string;
            APPWRITE_FUNCTION_ENDPOINT?: string;
            APPWRITE_FUNCTION_PROJECT_ID?: string;
            APPWRITE_PROJECT_ID?: string;
        }
    }
}

export { };
