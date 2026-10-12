import "./town.css";
import { TownGame } from "./TownGame";

const host = document.getElementById("town");
if (!host) throw new Error("#town element is missing from index.html");
new TownGame(host);
