//import { indexApp } from "./api";
import { ragApp } from "./api/rag";
import { pageApp } from "./pages";

pageApp.route('/api/rag', ragApp)
//pageApp.route('/api/index', indexApp)

export default pageApp;