# Clear Pop Up

Extension Chrome Manifest V3, entièrement locale, pour bloquer les fenêtres non sollicitées et masquer des overlays. Version initiale 0.1.3, à tester sur vos sites.

## Installation Chrome

1. Décompressez `clear-popup-0.1.3.zip`.
2. Ouvrez `chrome://extensions` et activez **Mode développeur**.
3. Cliquez **Charger l'extension non empaquetée**, puis sélectionnez le dossier `clear-popup` contenant le manifeste.
4. Épinglez Clear Pop Up. Désactivez l'ancien bloqueur de pop-up pendant les essais pour éviter les interférences. Rechargez les onglets ouverts.

Le même dossier est chargeable dans Comet. Le paquet n'est pas publié sur le Chrome Web Store, ni signé comme paquet CRX. Une archive ZIP n'est pas installable par simple glisser-déposer dans Chrome.

## Fonctionnement

- **Premier pop-up bloqué** : petit message en haut à droite, sous la barre du navigateur, une seule fois par chargement. « Garder bloqué » ferme le message sans changer vos réglages. « Autoriser ce site » ajoute l’hôte affiché aux exceptions de protection (pop-up et overlays), puis propose un bouton de rechargement distinct. La fenêtre refusée n’est jamais rejouée automatiquement. Un refus dans une iframe est signalé dans la page principale avec son hôte; l’exception vise cette origine précise.

- **Pop-up classiques** : interception de `window.open`, des liens ciblant une nouvelle fenêtre et des formulaires. Une activation réelle récente est nécessaire. Les liens ordinaires et les fenêtres ouvertes directement par un vrai clic restent utilisables. Le refus renvoie `null`, comme un bloqueur natif; aucun faux objet fenêtre.
- **Voile vide** : retrait des voiles plein écran qui interceptent les clics alors que leurs enfants sont déjà masqués, par exemple par un filtre cosmétique. Les dialogues demandés dont le contenu reste visible sont préservés.
- **État du site** : le panneau distingue protection active, site autorisé (gris) et protection désactivée. Les cases générales restent les préférences globales; les exceptions ont priorité. Une exception Clear Pop Up ne modifie ni le bloqueur natif de Chrome ni les autres extensions.
- **Overlays** : analyse locale de trois points du viewport et de huit ancêtres maximum par point; géométrie, positionnement, priorité et rôle de dialogue. Pas de scan intégral permanent, ni de boucle de polling. Les mutations DOM sont traitées avant le rendu, sans temporisation de 120 ms ni attente de DOMContentLoaded. Les onglets masqués ne sont pas analysés. Un bootstrap isolé, enregistré seulement pour les hôtes protégés, active les heuristiques dès document_start; les règles CSS mémorisées suivent le chargement des réglages locaux. Les exceptions et la désactivation sont respectées dès l’enregistrement.
- **Prudence** : les interfaces focalisées et celles apparaissant dans les 1,8 seconde suivant une interaction sont conservées. Le bouton de recherche manuelle contourne cette temporisation.
- **Choix manuel** : sélectionnez un élément; Échap annule. Mémorisation facultative d'un sélecteur CSS unique par hôte, pas du texte de l'élément.
- **Restauration** : barre dans la page ou bouton dans l'extension. Le dernier élément revient avec son style précédent. Après restauration, ce même élément est ignoré jusqu'au rechargement. Désactiver les overlays restaure les éléments masqués.
- **Exceptions** : nom d'hôte exact. `example.com` n'autorise pas `example.com.evil`, ni automatiquement `sub.example.com`. Les iframes sont traitées selon leur propre origine. Rechargez après une modification pour l'appliquer dès `document_start`.
- **Compteurs** : tentatives bloquées et éléments masqués, pas nombre de publicités ou de sites. Ils sont remis à zéro au chargement principal, gardés dans `storage.session`, supprimés avec l'onglet. Ils ne constituent pas un historique.

## Permissions et données

- `storage` : réglages et sélecteurs choisis dans `storage.local`; compteurs temporaires dans `storage.session`. Pas de synchronisation Google.
- `scripting` : enregistrer les scripts de démarrage MAIN et ISOLATED avant les scripts du site, en excluant les hôtes autorisés.
- `activeTab` et accès HTTP/HTTPS : interface de l'onglet et intervention sur les pages/iframes. Chrome avertit de l'accès aux sites car le blocage nécessite d'y agir.

Aucune API réseau dans le code de l'extension. Aucun serveur, télémétrie, identifiant, code distant, analyse de conversations, inspection des requêtes ou URL de désinstallation. Les pages continuent naturellement à effectuer leurs propres requêtes. Consultez [la politique de confidentialité](privacy.md).

## Limites

Les heuristiques peuvent rater un overlay ou masquer une interface utile. Les dialogues de paiement, OAuth et connexion ne sont pas reconnus par mots-clés d'URL : les ouvertures directement sollicitées sont conservées. Des ouvertures légitimes différées peuvent être refusées; utilisez l'exception du site. Une page hostile peut modifier le script MAIN ou imiter ses événements; ce mécanisme n'est pas une barrière de sécurité. Il ne remplace pas le pare-feu ou un bloqueur réseau. Les nouveaux onglets obtenus par des mécanismes navigateur non interceptés peuvent subsister.

Pas de gestion du consentement, de contournement de paywall, de suppression générale des publicités ou de liste malveillante. Le masquage ne garantit pas d'interrompre un média déjà chargé. Les styles/adaptations complexes du site peuvent limiter le déverrouillage du défilement. Les scripts n'agissent pas sur les pages internes de Chrome ni le Web Store.

## Développement

Node.js 22+ et npm. Aucune dépendance d'exécution embarquée.

```bash
npm ci
npx playwright install chromium
npm run check
npm test
npm run build
```

Les tests chargent le vrai paquet MV3 dans un profil Chromium jetable, avec serveur HTTP de fixtures sur loopback. Ils n'utilisent pas votre profil Chrome. Le build crée un dossier chargeable, une archive ZIP et son SHA256 dans `dist/`.

## Origine et licence

Implémentation originale inspirée de l'analyse fonctionnelle de Poper Blocker 8.11.3. Aucun code, catalogue ou SDK de cette extension n'est inclus. Code sous [licence MIT](license). Dépôt Git indépendant local; publication publique non encore effectuée.
