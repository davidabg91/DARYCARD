package com.xgd.pos.service;

interface IPiccReader {
    int open();
    int close();
    int detect(int timeout);
    byte[] getCardEx(int timeout);
    void stopSearch();
}
