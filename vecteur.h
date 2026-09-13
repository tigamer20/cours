#pragma once
// #pragma once : dit au compilateur de n'inclure ce fichier .h qu'une seule fois,
// meme s'il est "#include" depuis plusieurs autres fichiers. Ca evite les erreurs
// de "redefinition" de la classe vecteur.

#include <fstream>
// <fstream> nous donne acces aux flux d'entree/sortie (dont ostream, la classe
// utilisee pour representer un flux comme cout).

using namespace std;
// Permet d'ecrire "ostream" au lieu de "std::ostream" partout dans ce fichier.
// (std est l'espace de noms de la librairie standard C++)

class vecteur {
	private:
		// --- Attributs prives : accessibles seulement depuis l'interieur de la classe ---

		int* _tab;
		// Pointeur vers le premier element d'un tableau d'entiers alloue dynamiquement
		// avec "new int[...]". Vaut nullptr quand le vecteur est vide (aucune allocation).

		int _dim;
		// Nombre d'elements actuellement contenus dans _tab (la "taille" du vecteur).
		// Vaut 0 quand le vecteur est vide.

	public:
		// --- Interface publique : ce que le code exterieur a le droit d'utiliser ---

		vecteur();
		// Constructeur sans parametre.
		// Doit construire un vecteur VIDE : _dim = 0 et _tab = nullptr.
		// Important : un pointeur comme _tab ne doit jamais rester non initialise,
		// meme s'il ne pointe sur rien pour l'instant (d'ou nullptr).

		vecteur(int dim);
		// Constructeur avec parametre.
		// Doit construire un vecteur de "dim" entiers non initialises.
		// Cas particuliers a gerer (voir le TODO dans le .cpp) :
		//   - dim < 0  -> erreur (assert), on ne peut pas creer un vecteur de taille negative
		//   - dim == 0 -> vecteur vide valide (_tab = nullptr), pas d'appel a new[]
		//                 (new[0] est interdit par l'enonce du labo)
		//   - dim > 0  -> on alloue avec new int[dim]

		vecteur(const vecteur& source);
		// Copieur (constructeur de copie).
		// Cree un TOUT NOUVEAU vecteur qui contient une copie independante du contenu
		// de "source" (mémoire séparée). Si on copiait juste le pointeur _tab, les deux
		// vecteurs partageraient la meme memoire, et le destructeur de l'un ferait planter
		// l'autre en desallouant une memoire encore utilisee.

		~vecteur();
		// Destructeur.
		// Appele automatiquement quand un vecteur est detruit (fin de portee, delete, etc).
		// Doit desallouer _tab avec delete[] pour eviter une fuite de memoire, MAIS seulement
		// s'il y a quelque chose a desallouer (_tab != nullptr).

		void print(ostream& output) const;
		// Affiche tous les elements du vecteur dans le flux "output", separes par un espace.
		// "const" : garantit qu'on ne modifie jamais le vecteur en l'affichant (permet aussi
		// d'appeler cette methode sur un "const vecteur&", comme dans operator<< plus bas).

		// Ajoutez des méthodes ici au fur et à mesure que
		// vous avancez votre laboratoire sur le vecteur.
};

ostream& operator<<(ostream& output, const vecteur& v);
// Surcharge de l'operateur << pour pouvoir ecrire "cout << monVecteur;".
// - Fonction LIBRE (pas une methode de la classe) car l'operande de gauche (ostream,
//   comme "cout") n'est pas un objet vecteur : une methode membre ne pourrait pas
//   s'appliquer a "cout << ...".
// - Retourne "ostream&" (une reference vers le flux, pas une copie) pour permettre
//   le chainage : cout << v1 << v2;
// - Ne fait que déléguer le travail a v.print(output), comme demande par l'enonce.
