import { JournalView } from "./CashJournal";

/** Journal des comptes — mouvements bancaires : virements, OV (permanents /
 *  ponctuels), chèques, versements, prélèvements et carte. Mêmes colonnes et même
 *  solde cumulé que le journal de caisse (grille partagée `JournalView`) ; la
 *  colonne « n/c » y est remplacée par le mode de règlement et sa référence, une
 *  opération bancaire étant déclarée par construction. */
export function AccountingBankJournal() {
  return <JournalView channel="banque" />;
}
