/*
	Auteurs:	Julie Gagnon et Jacob Deschamps
	Date:		2022-08-27
	Programme:	testsVecteur.cpp
	But:		Jeu d'essais du laboratoire 3 pour le vecteur
*/

#include <iostream>
#include <iomanip>
#include "vecteur.h"

using namespace std;

int main() {
	setlocale(LC_CTYPE, "fra");	// Pour les accents

	// Étape 1-2 : Test des constructeurs incluant le copieur
	vecteur v1;					// Vecteur vide (constructeur sans paramètre)
	vecteur v2(5);				// Vecteur de 5 éléments (constructeur avec paramètre)
	vecteur v3(0);				// Vecteur vide

	/**********************************************************************/
	/* À partir d'ici, décommentez les lignes de code suivantes au fur et */
	/* à mesure que vous aurez implémenté les méthodes correspondantes de */
	/* votre propre vecteur.                                              */
	/**********************************************************************/

	
	
	vecteur v4(v1);				// Copie du vecteur vide (copieur)
	vecteur v5(v2);				// Copie du vecteur de 5 éléments

	 vecteur erreur(-1);		// Assert taille < 0, décommenter pour tester

	cout << endl
		<< "Déclarations" << endl << endl
		<< "vecteur <int> v1;	// vecteur vide (constructeur sans paramètre)" << endl
		<< "vecteur <int> v2(5);	// vecteur de 5 éléments (constructeur avec paramètre)" << endl
		<< "vecteur <int> v3(0);	// vecteur vide" << endl
		<< "vecteur <int> v4(v1);	// Copie du vecteur vide (copieur)" << endl
		<< "vecteur <int> v5(v2);	// Copie du vecteur de 5 éléments" << endl << endl;

	 //Étape 3 : Test de print() et de l'opérateur <<
	 //comme le print est appelé par operator<<, je teste que l'opérateur
	cout << endl
		<< "Étape 1,2 et 3 :Test constructeurs, print() et de l'opérateur <<" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;
	system("pause");

	/*
	// Étape 4 : Test de push_back()
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v4.push_back(5);			// push_back à un vecteur vide
	v5.push_back(5);			// push_back à un vecteur non vide

	cout << endl
		<< "Étape 4 : Test de push_back()" << endl << endl
		<< setw(15) << "" << "v4.push_back(5);	// push_back à un vecteur vide" << endl
		<< setw(15) << "" << "v5.push_back(5);	// push_back à un vecteur non vide" << endl << endl

		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	// Étape 5 : Test de size()
	cout << endl
		<< "Étape 5 : Test de size()" << endl << endl
		<< setw(15) << "" << "v1.size() : " << v1.size() << endl			// size d'un vecteur vide
		<< setw(15) << "" << "v2.size() : " << v2.size() << endl			// size d'un vecteur vide
		<< setw(15) << "" << "v3.size() : " << v3.size() << endl			// size d'un vecteur vide
		<< setw(15) << "" << "v4.size() : " << v4.size() << endl			// size d'un vecteur vide
		<< setw(15) << "" << "v5.size() : " << v5.size() << endl << endl;	// size d'un vecteur non vide
	system("pause");

	// Étape 6 : Test de resize()
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v1.resize(3);			// Agrandit un vecteur vide
	v2.resize(0);			// Réduit à 0 un vecteur non vide
	v5.resize(2);			// Réduit un vecteur non vide

	cout << endl
		<< "Étape 6 : Test de resize()" << endl << endl
		<< setw(15) << "" << "v1.resize(3);	//agrandit un vecteur vide" << endl
		<< setw(15) << "" << "v2.resize(0);	//réduit à 0 un vecteur non vide" << endl
		<< setw(15) << "" << "v5.resize(2);	//réduit un vecteur non vide" << endl << endl;

	cout << setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v5.resize(2);			// Même taille, fait rien
	cout << setw(15) << "" << "v5.resize(2);	//même taille, fait rien" << endl << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v5.resize(6);			// Agrandit un vecteur non vide
	cout << setw(15) << "" << "v5.resize(6);	//agrandit un vecteur non vide" << endl << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	//v5.resize(-3);		// Assert taille < 0

	system("pause");

	// Étape 7 : Test de clear()
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v1.clear();				// clear d'un vecteur non vide
	v2.clear();				// clear d'un vecteur vide

	cout << endl
		<< "Étape 7 : Test de clear()" << endl << endl
		<< setw(15) << "" << "v1.clear();	//clear d'un vecteur non vide" << endl
		<< setw(15) << "" << "v2.clear();	//clear d'un vecteur vide" << endl << endl;

	cout << setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl << endl;

	// Étape 8 : Test de at() 
	cout << endl
		<< "Étape 8 : Test de at()" << endl << endl
		<< setw(15) << "" << "for (int i = 0; i < v5.size(); i++)" << endl
		<< setw(15) << "" << "\t\tv5.at(i) = i * 2 + 1;" << endl << endl;

	for (int i = 0; i < v5.size(); i++)
		v5.at(i) = i * 2 + 1;

	//v1.at(0) = 5;			// Assert vecteur vide
	//v5.at(2) = 3;			// Assert pos en dehors des limites
	//v5.at(-2) = 3;			// Assert pos < 0

	cout << setw(20) << "v5 : " << v5 << endl << endl;

	// Étape 9 : Test de l'opérateur = (affectateur)
	system("pause");
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v2 = v4;				// Vide = non vide 

	cout << endl
		<< "Étape 9 : Test de l'opérateur =" << endl << endl
		<< setw(15) << "" << "v2 = v4;	//vide = non vide" << endl
		<< setw(15) << "" << "v2 : " << v2 << "\t" << "v4 : " << v4 << endl;

	v2 = v1;				// Non vide = vide

	cout << endl
		<< setw(15) << "" << "v2 = v1;	//non vide = vide" << endl
		<< setw(15) << "" << "v1 : " << v1 << "\t" << "v2 : " << v2 << endl;

	v3 = v2;				// Vide = vide

	cout << endl
		<< setw(15) << "" << "v3 = v2;	//vide = vide" << endl
		<< setw(15) << "" << "v2 : " << v2 << "\t" << "v3 : " << v3 << endl;

	v5 = v5;				// Un seul vecteur : CAS LIMITE. Ne doit rien faire et ne doit pas supprimer le vecteur

	cout << endl
		<< setw(15) << "" << "v5 = v5;	//un seul vecteur : CAS LIMITE" << endl
		<< setw(15) << "" << "v5 : " << v5 << endl;

	v3 = v4 = v5;

	cout << endl			// Vide = non vide = non vide
		<< setw(15) << "" << "v3 = v4 = v5;	//vide = non vide = non vide " << endl
		<< setw(15) << "" << "v3 : " << v3 << endl
		<< setw(15) << "" << "v4 : " << v4 << endl
		<< setw(15) << "" << "v5 : " << v5 << endl << endl;
	system("pause");

	// Étape 10 : Test de l'opérateur ==
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;


	cout << endl
		<< "Étape 10 : Test de l'opérateur ==" << endl << endl
		<< setw(15) << "" << "//tailles inégales dont 1 vide" << endl
		<< setw(15) << "" << "v2 == v4 ? : ";

	if (v2 == v4)			// Si v2 == v4 : 2 vecteurs de taille inégale dont 1 vide
		cout << "=" << endl;
	else
		cout << "Pas =" << endl;

	cout << endl << setw(15) << ""
		<< "//tailles et contenus égaux" << endl
		<< setw(15) << "" << "v3 == v5 ? : ";

	cout << ((v3 == v5) ? "=" : "Pas =") << endl;	// Si v3 == v5 : taille et contenu égaux


	v3.at(0) = 3;
	cout << endl << setw(15) << "" 
		<< "v3.at(0) = 3" << endl
		<< setw(15) << "" << "//tailles égales mais contenus inégaux" << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v5 : " << v5 << endl
		<< setw(15) << "" << "v3 == v5 ? : "
		<< ((v3 == v5) ? "=" : "Pas =") << endl;	// Si v3 == v5 : 2 vecteurs non égaux et de taille égale


	cout << endl << setw(15) << "" << "//2 vecteurs vides" << endl;
	cout << setw(15) << "" << "v1 == v2 ? : ";
	cout << ((v1 == v2) ? "=" : "Pas =") << endl;	// Si v1 == v2 : 2 vecteurs vides
	system("pause");

	// Étape 11 : Test de l'opérateur +
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	cout << endl
		<< "Étape 11 : Test de l'opérateur +" << endl << endl
		<< setw(15) << "" << "//+ de 2 vecteurs vides donne un vecteur vide" << endl
		<< setw(15) << "" << "v1 + v2 : " << v1 + v2 << endl << endl

		<< setw(15) << "" << "//+ de 1 vecteur vide + 1 non vide" << endl
		<< setw(15) << "" << "v2 + v3 : " << v2 + v3 << endl << endl

		<< setw(15) << "" << "//+ de 1 vecteur vide + 2 nons vides" << endl
		<< setw(15) << "" << "v2 + v3 + v5 : " << v2 + v3 + v5 << endl << endl

		<< setw(15) << "" << "//1 vecteur avec lui-même" << endl
		<< setw(15) << "" << "v3 + v3 : " << v3 + v3 << endl << endl;
	system("pause");

	// Étape 12 : Test de l'opérateur +=
	system("cls");
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	v2 += v1;				// += de 2 vecteurs vides, v2 reste  vide

	cout << endl
		<< "Étape 12 : Test de l'opérateur +=" << endl << endl
		<< setw(15) << "" << "//+= de 2 vecteurs vides, v2 reste  vide" << endl
		<< setw(15) << "" << "v2 += v1;" << endl
		<< setw(15) << "" << "v2 : " << v2 << endl;

	v2 += v3;				// += de 1 vecteur vide et 1 non vide
	cout << endl
		<< setw(15) << "" << "//+= de 1 vecteur vide et 1 non vide" << endl
		<< setw(15) << "" << "v2 += v3;" << endl
		<< setw(15) << "" << "v2 : " << v2 << endl;

	v3 += v4 + v5;			// += de 3 vecteurs non vides

	cout << endl
		<< setw(15) << "" << "//+= de 3 vecteurs non vides" << endl
		<< setw(15) << "" << "v3 += v4 + v5;" << endl
		<< setw(15) << "" << "v3 : " << v3 << endl;

	v2 += v2;				// += de 2 fois le même vecteur non vide

	cout << endl
		<< setw(15) << "" << "//+= de 2 fois le même vecteur non vide" << endl
		<< setw(15) << "" << "v2 += v2;" << endl
		<< setw(15) << "" << "v2 : " << v2 << endl << endl;
	system("pause");

	// Étape 13 : Test de swap()
	system("cls");
	v2.clear();
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	cout << endl
		<< "Étape 13 : Test de swap()" << endl << endl;

	swap(v1, v2);			// swap de 2 vecteurs vides

	cout << setw(15) << "" << "swap(v1,v2);	//swap de 2 vecteurs vides" << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl << endl;

	swap(v3, v4);			// swap de 2 vecteurs non vides

	cout << setw(15) << "" << "swap(v3,v4);	//swap de 2 vecteurs non vides" << endl;
	cout << setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl << endl;

	swap(v2, v5);			// swap d'un vecteur vide avec un non vide

	cout << setw(15) << "" << "swap(v2,v5);	//swap d'un vecteur vide avec un non vide" << endl;
	cout << setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;
	system("pause");

	// Étape 14 : Test de reverse()
	system("cls");
	v2.clear();
	cout << endl
		<< "Voici le contenu des vecteurs" << endl << endl
		<< setw(20) << "v1 : " << v1 << endl
		<< setw(20) << "v2 : " << v2 << endl
		<< setw(20) << "v3 : " << v3 << endl
		<< setw(20) << "v4 : " << v4 << endl
		<< setw(20) << "v5 : " << v5 << endl << endl;

	cout << endl
		<< "Étape 14 : Test de reverse() et reverseRecursive()" << endl << endl;

	v3.reverse();
	cout << setw(15) << "" << "//vecteur non-vide inversé" << endl
		<< setw(15) << "" << "v3 : " << v3 << endl << endl;
	v3.reverseRecursive();
	cout << setw(15) << "" << "//vecteur non-vide inversé avec la méthode récursive" << endl
		<< setw(15) << "" << "v3 : " << v3 << endl << endl;

	v1.reverse();
	cout << setw(15) << "" << "//vecteur vide inversé" << endl
		<< setw(15) << "" << "v1 : " << v1 << endl << endl;
	v1.reverseRecursive();
	cout << setw(15) << "" << "//vecteur vide inversé avec la méthode récursive" << endl
		<< setw(15) << "" << "v1 : " << v1 << endl << endl;

	system("pause");
	
	// Étape 15 : Test des "template"
	//vecteur<char> v6;
	//vecteur<string> v7;

	// Avec les vecteurs v6 et v7, appelez les différentes méthodes codées jusqu'à présent
	// pour vous assurez qu'elles sont fonctionnelles pour des types de données autres que
	// des entiers (dans ce cas-ci, des char et des string).

	// Fin de tests.

	*/

	return 0;
}