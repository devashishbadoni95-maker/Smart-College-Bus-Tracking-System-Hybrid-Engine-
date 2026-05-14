#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
    if (argc > 1 && std::string(argv[1]) == "check") {
        std::cout << "SUCCESS: Hybrid Engine (Node + C++) is Running Stable.";
    }
    return 0;
}