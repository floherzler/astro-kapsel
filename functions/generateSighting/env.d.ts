declare global {
    namespace NodeJS {
        interface ProcessEnv {
            FAL_API_KEY: string;
            APPWRITE_API_KEY?: string;
            APPWRITE_FUNCTION_API_ENDPOINT?: string;
            APPWRITE_FUNCTION_ENDPOINT?: string;
            APPWRITE_FUNCTION_PROJECT_ID?: string;
            APPWRITE_PROJECT_ID?: string;
            APPWRITE_DATABASE_ID?: string;
            APPWRITE_TABLE_SIGHTINGS?: string;
            APPWRITE_TABLE_FLYBYS?: string;
            APPWRITE_TABLE_COMETS?: string;
        }
    }
}

export { };
